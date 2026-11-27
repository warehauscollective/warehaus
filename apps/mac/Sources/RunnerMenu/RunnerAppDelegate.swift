import AppKit
import NotificationRouting
import PortalWindow
import UserNotifications

/// The app delegate, through `@NSApplicationDelegateAdaptor`. It wires the
/// pieces that must not know each other:
/// - warehaus:// links (Info.plist CFBundleURLTypes), including one that
///   launched the app, go to the Portal window raw. The window passes them to
///   the page with `navigate`; nothing here reads the route.
/// - One notification router is the UNUserNotificationCenter delegate. A
///   Portal alert click opens its link in the window; a runner notification
///   click opens the window too, where the runner chip says what is wrong.
@MainActor
public final class RunnerAppDelegate: NSObject, NSApplicationDelegate {
    public let notifications = NotificationRouter()

    override public init() {}

    public func applicationWillFinishLaunching(_ notification: Notification) {
        notifications.register(source: AlertNotificationContent.source) { userInfo in
            PortalWindowController.shared.openNotification(userInfo: userInfo)
        }
        notifications.register(source: SystemNotifier.source) { _ in
            PortalWindowController.shared.show()
        }
        // A bare binary has no bundle id, and UNUserNotificationCenter traps without one.
        if Bundle.main.bundleIdentifier != nil {
            UNUserNotificationCenter.current().delegate = notifications
        }
    }

    public func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            PortalWindowController.shared.open(portalLink: url.absoluteString)
        }
    }
}
