import AppKit
import PortalWindow

/// The app delegate, through `@NSApplicationDelegateAdaptor`. It takes
/// warehaus:// links (Info.plist CFBundleURLTypes), including one that
/// launched the app, and hands each to the Portal window raw. The window
/// passes it to the page with `navigate`; nothing here reads the route.
@MainActor
public final class RunnerAppDelegate: NSObject, NSApplicationDelegate {
    override public init() {}

    public func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            PortalWindowController.shared.open(portalLink: url.absoluteString)
        }
    }
}
