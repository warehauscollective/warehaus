import Foundation

/// Which Portal this build may show (ADR-0006, decision 3). A release build
/// loads only the production Portal. A debug build loads only a localhost
/// preview, and `ConvexGuard` stops that preview from reaching production
/// Convex, like `npm run preview:pr`.
///
/// This module keeps its own copy of the hosts on purpose: it never imports
/// RunnerSupervisor, whose `DeploymentPolicy` holds the runner's copy.
public struct PortalOrigins: Equatable, Sendable {
    public enum Flavor: Sendable { case release, debug }

    /// The production Portal on Vercel (project warehaus-portal). It has no custom domain yet.
    public static let productionHost = "warehaus-portal.vercel.app"
    public static let productionHome = URL(string: "https://\(productionHost)/projects")!
    /// Production Convex. A debug build never talks to it.
    public static let productionConvexDeployment = "unique-turtle-383"
    /// Where a debug build opens unless launched with `-PortalURL <url>`.
    public static let debugHome = URL(string: "http://localhost:3100/projects")!

    public let flavor: Flavor
    /// The page the window opens. Always an origin this flavor allows.
    public let home: URL

    private init(flavor: Flavor, home: URL) {
        self.flavor = flavor
        self.home = home
    }

    public static let release = PortalOrigins(flavor: .release, home: productionHome)

    /// A debug build's origins, or nil when `home` is not a localhost page.
    public static func debug(home: URL = debugHome) -> PortalOrigins? {
        guard allowsHome(home, flavor: .debug) else { return nil }
        return PortalOrigins(flavor: .debug, home: home)
    }

    /// True when the window may load `url` as its Portal.
    /// Release: https on the production host and default port, nothing else.
    /// Debug: http on localhost or 127.0.0.1, any port.
    public static func allowsHome(_ url: URL, flavor: Flavor) -> Bool {
        guard let host = url.host?.lowercased(), url.user == nil, url.password == nil else { return false }
        switch flavor {
        case .release:
            return url.scheme?.lowercased() == "https" && host == productionHost && (url.port == nil || url.port == 443)
        case .debug:
            return url.scheme?.lowercased() == "http" && (host == "localhost" || host == "127.0.0.1")
        }
    }

    /// The origins this binary was built with. A debug build reads
    /// `-PortalURL` from its launch arguments; nil means it was pointed at a
    /// page it must refuse.
    public static func current(arguments: UserDefaults = .standard) -> PortalOrigins? {
        #if DEBUG
        guard let text = arguments.string(forKey: "PortalURL") else { return debug() }
        guard let url = URL(string: text) else { return nil }
        return debug(home: url)
        #else
        return release
        #endif
    }

    /// True when `url` has the Portal's origin: same scheme, host and port as `home`.
    public func isPortal(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased() else { return false }
        return scheme == home.scheme?.lowercased()
            && host == home.host?.lowercased()
            && Self.port(of: url) == Self.port(of: home)
    }

    private static func port(of url: URL) -> Int? {
        if let port = url.port { return port }
        switch url.scheme?.lowercased() {
        case "https": return 443
        case "http": return 80
        default: return nil
        }
    }
}
