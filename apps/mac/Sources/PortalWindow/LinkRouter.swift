import Foundation
import NativeBridge

/// What the window does with a navigation.
public enum LinkDecision: Equatable, Sendable {
    /// Load it in the window.
    case allow
    /// Cancel it and open the link in the default browser.
    case openInBrowser(URL)
    /// Cancel it and hand the raw warehaus:// link to the page with `navigate`.
    case forwardToPortal(String)
    /// Cancel it.
    case cancel
}

/// Portal-origin navigations stay in the window; every other link goes to the
/// default browser. Pure, so the rules are tested without a web view.
public enum LinkRouter {
    /// Schemes the browser may be handed. Anything else is cancelled.
    static let browserSchemes: Set<String> = ["https", "http", "mailto"]

    /// - Parameters:
    ///   - isMainFrame: false for an iframe inside the page. A request for a
    ///     new window (`target="_blank"`, `window.open`) counts as main frame.
    public static func decide(_ url: URL, isMainFrame: Bool, origins: PortalOrigins) -> LinkDecision {
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == NativeBridge.portalLinkScheme { return .forwardToPortal(url.absoluteString) }
        if origins.isPortal(url) { return .allow }
        if scheme == "about" { return .allow }
        if !isMainFrame {
            // Embeds inside a Portal page (Figma, previews) load in their frame;
            // they cannot take over the window.
            return scheme == "https" || scheme == "blob" || scheme == "data" ? .allow : .cancel
        }
        return browserSchemes.contains(scheme) ? .openInBrowser(url) : .cancel
    }
}
