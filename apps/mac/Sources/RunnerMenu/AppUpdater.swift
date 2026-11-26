import AppKit
import CryptoKit
import Foundation
import RunnerSupervisor
import os

// Self-update between runs, never during one. AppUpdater holds the order:
// check, download, verify, wait for a moment between runs, swap, relaunch,
// and roll back if the new app doesn't check in. The work behind it is in
// three small protocols so the tests use fakes.

/// Where the latest release comes from: the runner's `app-release` command.
public protocol ReleaseSource: Sendable {
    func latest() async throws -> AppRelease?
}

/// The download and the checks on it.
@MainActor
public protocol UpdateWorkspace: AnyObject {
    /// Fetches the zip into a fresh folder in Application Support.
    func download(_ release: AppRelease) async throws -> URL
    func measure(_ zip: URL) throws -> (size: Int, sha256: String)
    /// `ditto -x -k`. Returns the .app inside.
    func unzip(_ zip: URL) async throws -> URL
    /// codesign, its team identifier, Info.plist and Gatekeeper. Size and hash are filled in by the caller.
    func inspect(_ app: URL) async -> DownloadFacts
    /// Deletes everything downloaded.
    func discard()
}

/// Replacing this app and starting the new one.
@MainActor
public protocol AppSwapping: AnyObject {
    /// False when the app can't replace itself where it is (no write access).
    func canReplace() -> Bool
    /// Moves this app aside as the rollback copy and puts `newApp` in its place.
    func swap(in newApp: URL) throws
    /// Starts the app now in place, telling it where to check in. Returns its process id.
    func launchReplacement(checkIn: URL) async throws -> pid_t
    func isRunning(_ pid: pid_t) -> Bool
    func checkedIn(_ flag: URL) -> Bool
    /// The new app failed: stop it, put the rollback copy back.
    func rollBack(stopping pid: pid_t) throws
    /// The new app is up: delete the rollback copy and quit this one.
    func finish()
    var checkInFlag: URL { get }
}

@MainActor
public final class AppUpdater: ObservableObject {
    @Published public private(set) var phase: UpdatePhase = .upToDate

    public let current: AppBuild
    private let source: ReleaseSource
    private let workspace: UpdateWorkspace
    private let swapper: AppSwapping
    private let stopRunner: () -> Void
    private let startRunner: () -> Void
    private let system: OperatingSystemVersion
    private let sleep: (TimeInterval) async -> Void
    private let log = Logger(subsystem: "co.warehaus.runner.app", category: "update")

    private var readyApp: URL?
    private var snapshot = RunnerSnapshot()
    private var checking = false

    public init(
        current: AppBuild,
        source: ReleaseSource,
        workspace: UpdateWorkspace,
        swapper: AppSwapping,
        stopRunner: @escaping () -> Void,
        startRunner: @escaping () -> Void,
        system: OperatingSystemVersion = ProcessInfo.processInfo.operatingSystemVersion,
        sleep: @escaping (TimeInterval) async -> Void = { try? await Task.sleep(for: .seconds($0)) }
    ) {
        self.current = current
        self.source = source
        self.workspace = workspace
        self.swapper = swapper
        self.stopRunner = stopRunner
        self.startRunner = startRunner
        self.system = system
        self.sleep = sleep
    }

    public func line(working: Bool) -> UpdateLine {
        UpdateLine.from(phase, current: current, working: working)
    }

    // MARK: Check and download

    /// On launch, every six hours, and on Check for update.
    public func check() async {
        guard !checking else { return }
        switch phase {
        case .downloading, .ready, .installing: return
        default: break
        }
        checking = true
        defer { checking = false }
        phase = .checking
        let release: AppRelease?
        do {
            release = try await source.latest()
        } catch {
            log.error("Update check failed: \(error.localizedDescription, privacy: .public)")
            phase = .failed(reason: "couldn't reach the Portal")
            return
        }
        guard let release, AppUpdateRule.needsUpdate(installed: current.build, latest: release) else {
            phase = .upToDate
            return
        }
        guard AppUpdateRule.runs(on: system, minMacOS: release.minMacOS) else {
            phase = .failed(reason: "it needs macOS \(release.minMacOS)")
            return
        }
        guard swapper.canReplace() else {
            phase = .notWritable
            return
        }
        await download(release)
    }

    private func download(_ release: AppRelease) async {
        phase = .downloading(version: release.version)
        do {
            let zip = try await workspace.download(release)
            let measured = try workspace.measure(zip)
            if let problem = UpdateVerifier.zipVerdict(size: measured.size, sha256: measured.sha256, release: release) {
                return reject(problem)
            }
            let app = try await workspace.unzip(zip)
            var facts = await workspace.inspect(app)
            facts.size = measured.size
            facts.sha256 = measured.sha256
            if let problem = UpdateVerifier.verdict(facts, release: release, current: current) {
                return reject(problem)
            }
            readyApp = app
            phase = .ready(version: release.version)
            await installIfSafe()
        } catch {
            log.error("Update download failed: \(error.localizedDescription, privacy: .public)")
            workspace.discard()
            phase = .failed(reason: "the download didn't finish")
        }
    }

    private func reject(_ problem: UpdateRejection) {
        log.error("Update rejected: \(String(describing: problem), privacy: .public)")
        workspace.discard()
        readyApp = nil
        phase = .failed(reason: problem.reason)
    }

    // MARK: Install between runs

    /// The supervisor's latest state. A verified update installs on the first idle moment.
    public func runnerChanged(_ snapshot: RunnerSnapshot) {
        self.snapshot = snapshot
        Task { await installIfSafe() }
    }

    private func installIfSafe() async {
        guard case let .ready(version) = phase, let app = readyApp, InstallGate.safeToInstall(snapshot) else { return }
        phase = .installing(version: version)
        stopRunner()
        do {
            try swapper.swap(in: app)
        } catch {
            log.error("Swap failed: \(error.localizedDescription, privacy: .public)")
            workspace.discard()
            readyApp = nil
            phase = .failed(reason: "the app couldn't be replaced")
            startRunner()
            return
        }
        let pid: pid_t
        do {
            pid = try await swapper.launchReplacement(checkIn: swapper.checkInFlag)
        } catch {
            return await rollBack(pid: 0)
        }
        var waited: TimeInterval = 0
        while true {
            switch SwapOutcome.decide(checkedIn: swapper.checkedIn(swapper.checkInFlag), newAppRunning: swapper.isRunning(pid), waited: waited) {
            case .keepNew:
                readyApp = nil
                swapper.finish()
                return
            case .rollBack:
                return await rollBack(pid: pid)
            case .keepWaiting:
                await sleep(0.5)
                waited += 0.5
            }
        }
    }

    private func rollBack(pid: pid_t) async {
        log.error("The new app didn't start. Rolling back.")
        do {
            try swapper.rollBack(stopping: pid)
        } catch {
            log.fault("Rollback failed: \(error.localizedDescription, privacy: .public)")
        }
        workspace.discard()
        readyApp = nil
        phase = .failed(reason: "the new version didn't start")
        startRunner()
    }
}

// MARK: - The runner's app-release command

/// `node cli.mjs app-release [--production]`, so the runner secret stays with the runner.
public struct RunnerReleaseSource: ReleaseSource {
    public let policy: DeploymentPolicy
    public let locator: RunnerLocating

    public init(policy: DeploymentPolicy, locator: RunnerLocating? = nil) {
        self.policy = policy
        self.locator = locator ?? FirstFound.forPolicy(policy)
    }

    public struct Failed: Error, LocalizedError {
        public var errorDescription: String?
    }

    public func latest() async throws -> AppRelease? {
        guard let installation = locator.locate() else { throw Failed(errorDescription: "runner files missing") }
        let arguments = [installation.cli.path] + (policy.production ? ["app-release", "--production"] : ["app-release"])
        let result = await Command.run(installation.node.path, arguments, path: installation.path)
        guard result.status == 0 else { throw Failed(errorDescription: "app-release exited \(result.status)") }
        for line in result.output.split(whereSeparator: \.isNewline) {
            if let parsed = AppRelease.parse(line: String(line)) { return parsed }
        }
        throw Failed(errorDescription: "app-release printed no release line")
    }
}

#if DEBUG
/// Debug only: `-UpdateRelease <release.json>` reads the release from a file
/// (a file:// url to a local zip is fine), so the update can be tried end to
/// end without the Portal.
public struct FileReleaseSource: ReleaseSource {
    public let file: URL
    public func latest() async throws -> AppRelease? {
        try JSONDecoder().decode(AppRelease.self, from: Data(contentsOf: file))
    }
}
#endif

// MARK: - Download and checks

@MainActor
public final class LiveUpdateWorkspace: UpdateWorkspace {
    private let root: URL
    private var folder: URL?

    public init(root: URL = LiveUpdateWorkspace.defaultRoot) {
        self.root = root
    }

    public nonisolated static var defaultRoot: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("co.warehaus.runner.app/Updates", isDirectory: true)
    }

    public func download(_ release: AppRelease) async throws -> URL {
        discard()
        let folder = root.appendingPathComponent("\(release.build)-\(UUID().uuidString.prefix(8))", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        self.folder = folder
        let zip = folder.appendingPathComponent("Warehaus-Runner.zip")
        if release.url.isFileURL {
            try FileManager.default.copyItem(at: release.url, to: zip)
        } else {
            guard release.url.scheme == "https" else { throw RunnerReleaseSource.Failed(errorDescription: "not https") }
            let (temporary, response) = try await URLSession.shared.download(from: release.url)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw RunnerReleaseSource.Failed(errorDescription: "download refused") }
            try FileManager.default.moveItem(at: temporary, to: zip)
        }
        return zip
    }

    public func measure(_ zip: URL) throws -> (size: Int, sha256: String) {
        let handle = try FileHandle(forReadingFrom: zip)
        defer { try? handle.close() }
        var hasher = SHA256()
        var size = 0
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
            size += chunk.count
        }
        let hex = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        return (size, hex)
    }

    public func unzip(_ zip: URL) async throws -> URL {
        let out = zip.deletingLastPathComponent().appendingPathComponent("unzipped", isDirectory: true)
        let result = await Command.run("/usr/bin/ditto", ["-x", "-k", zip.path, out.path], path: ["/usr/bin", "/bin"])
        guard result.status == 0 else { throw RunnerReleaseSource.Failed(errorDescription: "ditto failed") }
        let apps = try FileManager.default.contentsOfDirectory(at: out, includingPropertiesForKeys: nil).filter { $0.pathExtension == "app" }
        guard apps.count == 1 else { throw RunnerReleaseSource.Failed(errorDescription: "expected one app in the zip") }
        return apps[0]
    }

    public func inspect(_ app: URL) async -> DownloadFacts {
        let tools = ["/usr/bin", "/bin", "/usr/sbin"]
        let verify = await Command.run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path], path: tools)
        let details = await Command.run("/usr/bin/codesign", ["-dv", app.path], path: tools)
        let team = details.output.split(whereSeparator: \.isNewline)
            .first { $0.hasPrefix("TeamIdentifier=") }
            .map { String($0.dropFirst("TeamIdentifier=".count)) }
        let gatekeeper = await Command.run("/usr/sbin/spctl", ["-a", "-t", "exec", "-vv", app.path], path: tools)
        let accepted = gatekeeper.status == 0 && gatekeeper.output.contains("source=Notarized Developer ID")
        let info = NSDictionary(contentsOf: app.appendingPathComponent("Contents/Info.plist")) as? [String: Any] ?? [:]
        return DownloadFacts(
            size: 0,
            sha256: "",
            signatureValid: verify.status == 0,
            teamIdentifier: team,
            bundleIdentifier: info["CFBundleIdentifier"] as? String,
            build: (info["CFBundleVersion"] as? String).flatMap { Int($0) },
            gatekeeperAccepted: accepted
        )
    }

    public func discard() {
        if let folder { try? FileManager.default.removeItem(at: folder) }
        folder = nil
    }
}

// MARK: - Swapping the bundle

@MainActor
public final class LiveAppSwapper: AppSwapping {
    private let installed: URL
    private let rollback: URL
    public let checkInFlag: URL
    private var extraArguments: [String]
    private let log = Logger(subsystem: "co.warehaus.runner.app", category: "update")

    /// - extraArguments: passed on to the new app (debug fixtures only).
    public init(installed: URL = Bundle.main.bundleURL, root: URL = LiveUpdateWorkspace.defaultRoot, extraArguments: [String] = []) {
        self.installed = installed
        rollback = root.appendingPathComponent("rollback/\(installed.lastPathComponent)", isDirectory: true)
        checkInFlag = root.appendingPathComponent("checked-in")
        self.extraArguments = extraArguments
    }

    public func canReplace() -> Bool {
        let files = FileManager.default
        return files.isWritableFile(atPath: installed.deletingLastPathComponent().path) && files.isWritableFile(atPath: installed.path)
    }

    public func swap(in newApp: URL) throws {
        let files = FileManager.default
        try files.createDirectory(at: rollback.deletingLastPathComponent(), withIntermediateDirectories: true)
        if files.fileExists(atPath: rollback.path) { try files.removeItem(at: rollback) }
        try? files.removeItem(at: checkInFlag)
        try files.moveItem(at: installed, to: rollback)
        do {
            try files.moveItem(at: newApp, to: installed)
        } catch {
            // Put this app back before reporting.
            try? files.moveItem(at: rollback, to: installed)
            throw error
        }
    }

    public func launchReplacement(checkIn: URL) async throws -> pid_t {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.createsNewApplicationInstance = true
        configuration.arguments = ["-UpdateCheckIn", checkIn.path] + extraArguments
        let app = try await NSWorkspace.shared.openApplication(at: installed, configuration: configuration)
        return app.processIdentifier
    }

    public func isRunning(_ pid: pid_t) -> Bool {
        NSRunningApplication(processIdentifier: pid).map { !$0.isTerminated } ?? false
    }

    public func checkedIn(_ flag: URL) -> Bool {
        FileManager.default.fileExists(atPath: flag.path)
    }

    public func rollBack(stopping pid: pid_t) throws {
        if pid > 0, let app = NSRunningApplication(processIdentifier: pid) { app.forceTerminate() }
        let files = FileManager.default
        guard files.fileExists(atPath: rollback.path) else { return }
        if files.fileExists(atPath: installed.path) { try files.removeItem(at: installed) }
        try files.moveItem(at: rollback, to: installed)
    }

    public func finish() {
        try? FileManager.default.removeItem(at: rollback)
        try? FileManager.default.removeItem(at: checkInFlag)
        log.info("Updated. This copy quits.")
        NSApp.terminate(nil)
    }
}

/// The new app's side: started with `-UpdateCheckIn <path>`, it writes that
/// file once it is up, and the old copy then quits and deletes its rollback.
public enum UpdateCheckIn {
    public static func writeIfAsked(arguments: UserDefaults = .standard) {
        guard let path = arguments.string(forKey: "UpdateCheckIn") else { return }
        // Only the update folder: a stray argument can't make the app write elsewhere.
        let flag = URL(fileURLWithPath: path).standardizedFileURL
        guard flag.deletingLastPathComponent() == LiveUpdateWorkspace.defaultRoot.standardizedFileURL else { return }
        try? Data("\(ProcessInfo.processInfo.processIdentifier)\n".utf8).write(to: flag)
    }
}
