import Foundation

// Self-update between runs, never during one (decision 0005). The pure parts:
// what counts as newer, whether a downloaded app may be installed, whether now
// is a safe moment, and what the menu's update line says. RunnerMenu does the
// file and process work behind small protocols.

/// The latest build from `POST /agent/app-release` (apps/portal/convex/_lib/runnerApp.ts,
/// RunnerAppReleaseView), as the runner's `app-release` command prints it.
public struct AppRelease: Equatable, Sendable, Decodable {
    public var version: String
    public var build: Int
    public var sha256: String
    public var size: Int
    public var minMacOS: String
    public var url: URL

    public init(version: String, build: Int, sha256: String, size: Int, minMacOS: String = "14.0", url: URL) {
        self.version = version
        self.build = build
        self.sha256 = sha256
        self.size = size
        self.minMacOS = minMacOS
        self.url = url
    }

    /// The `app_release` line from `app-release`. `.some(nil)` means no release is published.
    public static func parse(line: String) -> AppRelease?? {
        guard line.hasPrefix(RunnerEvent.prefix) else { return nil }
        struct Raw: Decodable { var type: String; var release: AppRelease? }
        guard let raw = try? JSONDecoder().decode(Raw.self, from: Data(line.dropFirst(RunnerEvent.prefix.count).utf8)),
              raw.type == "app_release" else { return nil }
        return .some(raw.release)
    }
}

/// This app: `CFBundleShortVersionString` and `CFBundleVersion`.
public struct AppBuild: Equatable, Sendable {
    public var version: String
    public var build: Int?

    public init(version: String, build: Int?) {
        self.version = version
        self.build = build
    }

    public static func of(_ bundle: Bundle) -> AppBuild {
        let info = bundle.infoDictionary ?? [:]
        return AppBuild(
            version: info["CFBundleShortVersionString"] as? String ?? "dev",
            build: (info["CFBundleVersion"] as? String).flatMap { Int($0) }
        )
    }
}

public enum AppUpdateRule {
    /// Ask on launch, then this often, and on Check for update.
    public static let checkInterval: TimeInterval = 6 * 60 * 60
    public static let teamIdentifier = "7XQWUC33C7"
    public static let bundleIdentifier = "co.warehaus.runner.app"

    /// `runnerAppNeedsUpdate` in apps/portal/convex/_lib/runnerApp.ts: a higher
    /// release build than this app's. An app without a build number (a debug
    /// run from Xcode) takes any release.
    public static func needsUpdate(installed: Int?, latest: AppRelease?) -> Bool {
        guard let latest else { return false }
        guard let installed else { return true }
        return latest.build > installed
    }

    /// True when this macOS can run the release (`minMacOS` like "14.0").
    public static func runs(on system: OperatingSystemVersion, minMacOS: String) -> Bool {
        let parts = minMacOS.split(separator: ".").compactMap { Int($0) }
        let needed = OperatingSystemVersion(majorVersion: parts.first ?? 14, minorVersion: parts.dropFirst().first ?? 0, patchVersion: 0)
        return (system.majorVersion, system.minorVersion) >= (needed.majorVersion, needed.minorVersion)
    }
}

// MARK: - Verifying a download

/// What the checks found about a downloaded update.
public struct DownloadFacts: Equatable, Sendable {
    public var size: Int
    public var sha256: String
    /// `codesign --verify --deep --strict` passed.
    public var signatureValid: Bool
    /// TeamIdentifier from `codesign -dv`.
    public var teamIdentifier: String?
    public var bundleIdentifier: String?
    public var build: Int?
    /// `spctl -a -t exec` accepted it as a notarized Developer ID app.
    public var gatekeeperAccepted: Bool

    public init(size: Int, sha256: String, signatureValid: Bool, teamIdentifier: String?, bundleIdentifier: String?, build: Int?, gatekeeperAccepted: Bool) {
        self.size = size
        self.sha256 = sha256
        self.signatureValid = signatureValid
        self.teamIdentifier = teamIdentifier
        self.bundleIdentifier = bundleIdentifier
        self.build = build
        self.gatekeeperAccepted = gatekeeperAccepted
    }
}

public enum UpdateRejection: Equatable, Sendable {
    case sizeMismatch
    case checksumMismatch
    case badSignature
    case wrongTeam
    case wrongApp
    case notNewer
    case notNotarized
    case wrongBuild

    /// For the update line: "Update failed: <reason>".
    public var reason: String {
        switch self {
        case .sizeMismatch, .checksumMismatch: return "the download didn't match"
        case .badSignature: return "the signature didn't check out"
        case .wrongTeam: return "it isn't signed by Warehaus"
        case .wrongApp: return "it isn't Warehaus Runner"
        case .notNewer: return "it isn't newer than this version"
        case .notNotarized: return "macOS didn't accept it"
        case .wrongBuild: return "it isn't the build the Portal named"
        }
    }
}

public enum UpdateVerifier {
    /// Every check must pass before the app is installed. The size and hash
    /// are checked first, on the zip, before anything is unzipped.
    public static func verdict(
        _ facts: DownloadFacts,
        release: AppRelease,
        current: AppBuild,
        team: String = AppUpdateRule.teamIdentifier,
        bundleId: String = AppUpdateRule.bundleIdentifier
    ) -> UpdateRejection? {
        if let problem = zipVerdict(size: facts.size, sha256: facts.sha256, release: release) { return problem }
        guard facts.signatureValid else { return .badSignature }
        guard facts.teamIdentifier == team else { return .wrongTeam }
        guard facts.bundleIdentifier == bundleId else { return .wrongApp }
        guard let build = facts.build else { return .wrongBuild }
        guard build == release.build else { return .wrongBuild }
        if let installed = current.build, build <= installed { return .notNewer }
        guard facts.gatekeeperAccepted else { return .notNotarized }
        return nil
    }

    /// The zip alone: its size and SHA-256 against the release.
    public static func zipVerdict(size: Int, sha256: String, release: AppRelease) -> UpdateRejection? {
        guard size == release.size else { return .sizeMismatch }
        guard sha256.lowercased() == release.sha256.lowercased() else { return .checksumMismatch }
        return nil
    }
}

// MARK: - When to install

public enum InstallGate {
    /// Between runs only: idle, paused, or no runner process. A run in
    /// progress always finishes first; a starting runner gets to say where it
    /// is before the app stops it.
    public static func safeToInstall(_ snapshot: RunnerSnapshot) -> Bool {
        switch snapshot.activity {
        case .idle, .paused, .stopped: return true
        case .working, .starting: return false
        }
    }
}

// MARK: - The update line

/// Where self-update stands.
public enum UpdatePhase: Equatable, Sendable {
    case upToDate
    case checking
    case downloading(version: String)
    /// Verified and waiting for a moment between runs.
    case ready(version: String)
    case installing(version: String)
    case failed(reason: String)
    /// The app can't replace itself where it is.
    case notWritable
}

/// One row: the line, its trailing text, and whether Check for update follows it.
public struct UpdateLine: Equatable, Sendable {
    public var title: String
    public var trailing: String?
    public var offersCheck: Bool

    public init(title: String, trailing: String?, offersCheck: Bool) {
        self.title = title
        self.trailing = trailing
        self.offersCheck = offersCheck
    }

    /// The wording in design iteration 2. `working` is a run in progress.
    public static func from(_ phase: UpdatePhase, current: AppBuild, working: Bool) -> UpdateLine {
        let mine = "v\(current.version)"
        switch phase {
        case .upToDate:
            // An update found now would wait for the run anyway.
            return UpdateLine(title: "Up to date", trailing: mine, offersCheck: !working)
        case .checking:
            return UpdateLine(title: "Checking for update…", trailing: mine, offersCheck: false)
        case let .downloading(version):
            return UpdateLine(title: "Downloading update…", trailing: "v\(version)", offersCheck: false)
        case let .ready(version):
            return UpdateLine(title: working ? "Update waits for this run" : "Installs before the next run", trailing: "v\(version)", offersCheck: false)
        case let .installing(version):
            return UpdateLine(title: "Installing update…", trailing: "v\(version)", offersCheck: false)
        case let .failed(reason):
            return UpdateLine(title: "Update failed: \(reason)", trailing: mine, offersCheck: !working)
        case .notWritable:
            return UpdateLine(title: "Can't update here. Move the app to Applications.", trailing: mine, offersCheck: false)
        }
    }
}

// MARK: - After the swap

/// What the old app does after starting the new one: wait for the new app
/// to check in, then delete the rollback copy, or put the old app back.
public enum SwapOutcome: Equatable, Sendable {
    case keepNew
    case rollBack
    case keepWaiting

    public static let checkInTimeout: TimeInterval = 45

    public static func decide(checkedIn: Bool, newAppRunning: Bool, waited: TimeInterval) -> SwapOutcome {
        if checkedIn { return .keepNew }
        // It quit or crashed before checking in, or never got there in time.
        if !newAppRunning && waited > 3 { return .rollBack }
        return waited >= checkInTimeout ? .rollBack : .keepWaiting
    }
}
