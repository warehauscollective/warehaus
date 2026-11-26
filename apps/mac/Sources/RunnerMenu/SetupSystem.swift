import AppKit
import Foundation
import RunnerSupervisor
import os

/// The commands first launch runs. Each one is started by a click in the
/// checklist, except the read-only checks. Fixtures stand in for it in debug.
@MainActor
public protocol SetupSystem: AnyObject {
    func githubStatus() async -> GitHubFact
    /// `gh auth login --web`. Calls `code` with the one-time code, then returns the result.
    func githubSignIn(code: @escaping @MainActor (String) -> Void) async -> GitHubFact
    func claudeStatus() async -> ClaudeFact
    /// Anthropic's official installer, only after the Install click.
    func installClaude() async -> ClaudeFact
    func claudeSignIn() async -> ClaudeFact
    /// The takeover facts for this build's deployment. Reads, changes nothing.
    func takeover() -> Takeover
    /// Unloads and deletes the terminal runner's launchd agent. Release builds only.
    func removeOldAgent() async -> String?
    /// Starts `setup --supervised`. Events arrive on the main actor.
    func startPairing(_ events: @escaping @MainActor (PairingEvent?) -> Void) -> SetupCancel?
    func open(_ url: URL)
}

public protocol SetupCancel: AnyObject {
    func cancel()
}

/// The real commands. gh comes from the bundle (the checkout's PATH in debug),
/// `claude` from Anthropic's installer location or the PATH.
@MainActor
public final class LiveSetupSystem: SetupSystem {
    private let policy: DeploymentPolicy
    private let installation: RunnerInstallation?
    private let home: URL
    private let log = Logger(subsystem: "co.warehaus.runner.app", category: "setup")

    public init(policy: DeploymentPolicy, home: URL = FileManager.default.homeDirectoryForCurrentUser) {
        self.policy = policy
        self.home = home
        installation = FirstFound.forPolicy(policy).locate()
    }

    private var path: [String] {
        installation?.path ?? (RunnerInstallation.userPathForApp(home: home) + ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"])
    }

    private func find(_ tool: String) -> String? {
        path.map { "\($0)/\(tool)" }.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    // MARK: GitHub

    public func githubStatus() async -> GitHubFact {
        guard let gh = find("gh") else { return .failed("GitHub CLI is missing from this app. Download it again from the Portal.") }
        let result = await Command.run(gh, ["auth", "status", "--hostname", "github.com"], path: path)
        if let login = SetupOutput.githubLogin(fromStatus: result.output), result.status == 0 { return .signedIn(login: login) }
        return .signedOut
    }

    public func githubSignIn(code: @escaping @MainActor (String) -> Void) async -> GitHubFact {
        guard let gh = find("gh") else { return .failed("GitHub CLI is missing from this app.") }
        var sent = false
        let result = await Command.run(
            gh, ["auth", "login", "--web", "--hostname", "github.com", "--git-protocol", "https"],
            path: path,
            // gh waits for Enter before it opens the browser.
            input: "\n",
            onOutput: { text in
                if !sent, let found = SetupOutput.githubDeviceCode(in: text) {
                    sent = true
                    code(found)
                }
            }
        )
        if result.status != 0 { return .failed("GitHub sign-in didn't finish. Try again.") }
        return await githubStatus()
    }

    // MARK: Claude Code

    private var claudePath: String? {
        ([home.appendingPathComponent(".local/bin/claude").path] + path.map { "\($0)/claude" })
            .first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    public func claudeStatus() async -> ClaudeFact {
        guard let claude = claudePath else { return .missing }
        let result = await Command.run(claude, ["auth", "status", "--json"], path: path)
        return SetupOutput.claude(fromStatus: result.output) ?? .signedOut
    }

    public func installClaude() async -> ClaudeFact {
        // Anthropic's official installer (https://claude.ai/install.sh), run only after the Install click.
        let result = await Command.run("/bin/bash", ["-c", "curl -fsSL --proto '=https' https://claude.ai/install.sh | bash"], path: path)
        guard result.status == 0, claudePath != nil else {
            log.error("Claude Code install failed: \(result.output, privacy: .public)")
            return .failed("Claude Code didn't install. Check the connection and try again.")
        }
        return await claudeStatus()
    }

    public func claudeSignIn() async -> ClaudeFact {
        guard let claude = claudePath else { return .missing }
        let result = await Command.run(claude, ["auth", "login"], path: path)
        if result.status != 0 { return .failed("Claude Code sign-in didn't finish. Try again.") }
        return await claudeStatus()
    }

    // MARK: Takeover

    private var agentPlist: URL {
        home.appendingPathComponent("Library/LaunchAgents/\(policy.launchAgentLabel).plist")
    }

    public func takeover() -> Takeover {
        let pairing = PairingFile(policy: policy, home: home).read()
        let hasSecret = pairing.map { Keychain.hasItem(service: "warehaus-runner", account: policy.keychainAccount(runnerId: $0.runnerId)) } ?? false
        return Takeover.decide(
            policy: policy,
            pairing: pairing,
            hasSecret: hasSecret,
            agentInstalled: FileManager.default.fileExists(atPath: agentPlist.path)
        )
    }

    public func removeOldAgent() async -> String? {
        // Debug builds never touch the terminal runner's agent.
        guard policy.production else { return "Debug builds leave the agent alone." }
        let target = "gui/\(getuid())/\(policy.launchAgentLabel)"
        let bootout = await Command.run("/bin/launchctl", ["bootout", target], path: path)
        // 3 and 113 mean it wasn't loaded: nothing to stop.
        if ![0, 3, 113].contains(bootout.status) {
            log.error("launchctl bootout \(target, privacy: .public): \(bootout.status) \(bootout.output, privacy: .public)")
        }
        do {
            try FileManager.default.removeItem(at: agentPlist)
        } catch {
            return error.localizedDescription
        }
        return nil
    }

    // MARK: Pairing

    public func startPairing(_ events: @escaping @MainActor (PairingEvent?) -> Void) -> SetupCancel? {
        guard let installation else { return nil }
        let child = NodeRunnerProcess(installation, arguments: policy.setupArguments)
        child.onLine = { line in
            if let event = PairingEvent.parse(line: line) { events(event) }
        }
        child.onExit = { code in if code != 0 { events(nil) } }
        do {
            try child.start()
        } catch {
            return nil
        }
        return ProcessCancel(child)
    }

    public func open(_ url: URL) { NSWorkspace.shared.open(url) }
}

private final class ProcessCancel: SetupCancel {
    let process: RunnerProcess
    init(_ process: RunnerProcess) { self.process = process }
    func cancel() { process.terminate() }
}

extension RunnerInstallation {
    static func userPathForApp(home: URL) -> [String] { [home.appendingPathComponent(".local/bin").path] }
}

// MARK: - Small helpers

enum Keychain {
    /// True when a generic password item exists. Never reads the secret (no `-w`).
    static func hasItem(service: String, account: String) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        process.arguments = ["find-generic-password", "-s", service, "-a", account]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }
}

struct CommandResult {
    var status: Int32
    var output: String
}

enum Command {
    /// Runs a tool with a small environment and collects stdout and stderr.
    static func run(
        _ tool: String,
        _ arguments: [String],
        path: [String],
        input: String? = nil,
        onOutput: (@MainActor (String) -> Void)? = nil
    ) async -> CommandResult {
        await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: tool)
            process.arguments = arguments
            var env = ProcessInfo.processInfo.environment.filter { ["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG"].contains($0.key) }
            env["PATH"] = path.joined(separator: ":")
            env["NO_COLOR"] = "1"
            process.environment = env
            let out = Pipe()
            let stdin = Pipe()
            process.standardOutput = out
            process.standardError = out
            process.standardInput = stdin
            let collected = OutputBuffer()
            out.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                guard !data.isEmpty else { return }
                let text = collected.append(data)
                if let onOutput { DispatchQueue.main.async { MainActor.assumeIsolated { onOutput(text) } } }
            }
            process.terminationHandler = { finished in
                out.fileHandleForReading.readabilityHandler = nil
                let rest = out.fileHandleForReading.readDataToEndOfFile()
                let text = collected.append(rest)
                continuation.resume(returning: CommandResult(status: finished.terminationStatus, output: text))
            }
            do {
                try process.run()
                if let input { stdin.fileHandleForWriting.write(Data(input.utf8)) }
            } catch {
                continuation.resume(returning: CommandResult(status: -1, output: error.localizedDescription))
            }
        }
    }
}

/// Output so far, shared between the pipe handler and the exit handler.
final class OutputBuffer: @unchecked Sendable {
    private var data = Data()
    private let lock = NSLock()

    func append(_ chunk: Data) -> String {
        lock.lock()
        defer { lock.unlock() }
        data.append(chunk)
        return String(decoding: data, as: UTF8.self)
    }
}
