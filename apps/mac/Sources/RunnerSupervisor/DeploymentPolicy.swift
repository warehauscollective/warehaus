import Foundation

/// Production only (ADR-0005, Portal decision 0003). A release build runs the
/// runner against production and refuses any other deployment, so it never
/// pairs to dev. A debug build runs against shared dev and refuses production
/// `unique-turtle-383`, like `npm run preview:pr`.
public struct DeploymentPolicy: Equatable, Sendable {
    public enum Flavor: Sendable { case release, debug }

    public static let productionDeployment = "unique-turtle-383"
    public static let devDeployment = "graceful-mastiff-960"

    public let flavor: Flavor

    public init(flavor: Flavor) {
        self.flavor = flavor
    }

    /// The policy this binary was built with.
    public static var current: DeploymentPolicy {
        #if DEBUG
        DeploymentPolicy(flavor: .debug)
        #else
        DeploymentPolicy(flavor: .release)
        #endif
    }

    public var production: Bool { flavor == .release }

    /// The file `npm run runner -- setup` writes under ~/.config/warehaus.
    public var configFileName: String { production ? "runner.prod.env" : "runner.env" }

    /// Open Portal goes here. Debug builds open the local preview.
    public var portalURL: URL {
        production ? URL(string: "https://warehaus-portal.vercel.app/projects")! : URL(string: "http://localhost:3100/projects")!
    }

    /// How many milestones the runner works at once, one run on each.
    public static let parallelRuns = 3

    /// The runner's arguments. Headless, because nobody drives a session from
    /// the menu bar. `--production` is written in for release builds only.
    public func runnerArguments(paused: Bool) -> [String] {
        var arguments = ["start", "--supervised", "--mode", "headless", "--parallel", String(Self.parallelRuns)]
        if production { arguments.append("--production") }
        if paused { arguments.append("--paused") }
        return arguments
    }

    public var removeArguments: [String] {
        production ? ["remove", "--production"] : ["remove"]
    }

    /// True when a saved pairing's Convex site URL is one this build may use.
    public func allows(agentURL: String) -> Bool {
        guard let url = URL(string: agentURL), url.scheme == "https", let host = url.host?.lowercased(),
              host.hasSuffix(".convex.site") else { return false }
        let isProduction = host == "\(Self.productionDeployment).convex.site"
        return production ? isProduction : !host.contains(Self.productionDeployment)
    }
}
