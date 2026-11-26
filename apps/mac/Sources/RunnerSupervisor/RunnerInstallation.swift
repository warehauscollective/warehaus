import Foundation

/// Where the Node runner lives and what it needs on PATH.
public struct RunnerInstallation: Equatable, Sendable {
    public var node: URL
    public var cli: URL
    public var workingDirectory: URL
    /// Folders put in front of PATH: the bundled gh, then the usual tool folders.
    public var path: [String]

    public init(node: URL, cli: URL, workingDirectory: URL, path: [String]) {
        self.node = node
        self.cli = cli
        self.workingDirectory = workingDirectory
        self.path = path
    }

    static let systemPath = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]

    /// Where Anthropic's installer puts `claude`. The runner spawns it by name.
    static func userPath(home: URL) -> [String] {
        [home.appendingPathComponent(".local/bin").path]
    }
}

/// The fixed layout scripts/bundle-runtime.sh writes under Contents/Resources.
/// Change both together.
///
///     runner/
///         bin/node   bin/gh                         (pinned in runtime.lock)
///         tools/runner/src/cli.mjs   tools/runner/{hooks,prompts}
///         packages/runner-protocol/{index.mjs,package.json}
///         licenses/   VERSIONS
public struct RuntimeLayout: Equatable, Sendable {
    public let root: URL

    public init(resources: URL) {
        root = resources.appendingPathComponent("runner", isDirectory: true)
    }

    public var bin: URL { root.appendingPathComponent("bin", isDirectory: true) }
    public var node: URL { bin.appendingPathComponent("node") }
    public var gh: URL { bin.appendingPathComponent("gh") }
    public var cli: URL { root.appendingPathComponent("tools/runner/src/cli.mjs") }
    public var protocolPackage: URL { root.appendingPathComponent("packages/runner-protocol/index.mjs") }

    /// The bundled tools first, then `claude` from Anthropic's installer, then the system.
    public func path(home: URL) -> [String] {
        [bin.path] + RunnerInstallation.userPath(home: home) + RunnerInstallation.systemPath
    }

    /// The installation, when every file the runner needs is there.
    public func installation(home: URL, files: FileManager = .default) -> RunnerInstallation? {
        guard files.isExecutableFile(atPath: node.path), files.isExecutableFile(atPath: gh.path),
              files.fileExists(atPath: cli.path), files.fileExists(atPath: protocolPackage.path) else { return nil }
        return RunnerInstallation(node: node, cli: cli, workingDirectory: root, path: path(home: home))
    }
}

/// Finds the runner. A seam: the first-launch task bundles Node, the runner
/// and gh into the app, and self-update replaces them between runs.
public protocol RunnerLocating: Sendable {
    func locate() -> RunnerInstallation?
}

/// The release runner: Node, gh and the runner inside the app bundle
/// (RuntimeLayout, filled by scripts/bundle-runtime.sh).
public struct BundledRunner: RunnerLocating {
    public let resources: URL?
    public let home: URL

    public init(resources: URL? = Bundle.main.resourceURL, home: URL = FileManager.default.homeDirectoryForCurrentUser) {
        self.resources = resources
        self.home = home
    }

    public var layout: RuntimeLayout? { resources.map(RuntimeLayout.init(resources:)) }

    public func locate() -> RunnerInstallation? {
        layout?.installation(home: home)
    }
}

/// Debug builds only: the runner in this repository checkout and the Node on
/// this Mac. `WAREHAUS_REPO` and `WAREHAUS_NODE` override the guesses.
public struct CheckoutRunner: RunnerLocating {
    public let environment: [String: String]
    public let sourceFile: String

    public init(environment: [String: String] = ProcessInfo.processInfo.environment, sourceFile: String = #filePath) {
        self.environment = environment
        self.sourceFile = sourceFile
    }

    public func locate() -> RunnerInstallation? {
        let files = FileManager.default
        // apps/mac/Sources/RunnerSupervisor/RunnerInstallation.swift is five levels below the repository root.
        let guessed = URL(fileURLWithPath: sourceFile)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let repo = environment["WAREHAUS_REPO"].map { URL(fileURLWithPath: $0) } ?? guessed
        let cli = repo.appendingPathComponent("tools/runner/src/cli.mjs")
        guard files.fileExists(atPath: cli.path) else { return nil }
        let candidates = [environment["WAREHAUS_NODE"], "/opt/homebrew/bin/node", "/usr/local/bin/node"].compactMap { $0 }
        guard let node = candidates.first(where: { files.isExecutableFile(atPath: $0) }) else { return nil }
        return RunnerInstallation(
            node: URL(fileURLWithPath: node),
            cli: cli,
            workingDirectory: repo,
            path: RunnerInstallation.userPath(home: FileManager.default.homeDirectoryForCurrentUser) + RunnerInstallation.systemPath
        )
    }
}

/// Tries each locator in turn.
public struct FirstFound: RunnerLocating {
    public let locators: [any RunnerLocating]

    public init(_ locators: [any RunnerLocating]) {
        self.locators = locators
    }

    public func locate() -> RunnerInstallation? {
        for locator in locators {
            if let found = locator.locate() { return found }
        }
        return nil
    }

    /// Release builds use only the bundle. Debug builds prefer the checkout.
    public static func forPolicy(_ policy: DeploymentPolicy) -> FirstFound {
        policy.production ? FirstFound([BundledRunner()]) : FirstFound([CheckoutRunner(), BundledRunner()])
    }
}
