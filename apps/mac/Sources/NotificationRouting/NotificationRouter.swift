import Foundation
import UserNotifications

/// The app's one UNUserNotificationCenter delegate. The runner menu and the
/// Portal window both post notifications; each tags its own with a source in
/// userInfo and registers a click handler for that source here. Neither module
/// knows the other: the app's delegate creates the router and wires both.
@MainActor
public final class NotificationRouter: NSObject {
    /// The userInfo key every notification carries.
    public static let sourceKey = "source"

    public typealias Handler = @MainActor ([AnyHashable: Any]) -> Void

    private var handlers: [String: Handler] = [:]

    override public init() {}

    /// Calls `handler` when a notification from `source` is clicked.
    public func register(source: String, handler: @escaping Handler) {
        handlers[source] = handler
    }

    /// The source a notification's userInfo names, or nil.
    public nonisolated static func source(of userInfo: [AnyHashable: Any]) -> String? {
        userInfo[sourceKey] as? String
    }

    /// Delivers a click to its source's handler. Returns false when no handler took it.
    @discardableResult
    public func route(_ userInfo: [AnyHashable: Any]) -> Bool {
        guard let source = Self.source(of: userInfo), let handler = handlers[source] else { return false }
        handler(userInfo)
        return true
    }
}

extension NotificationRouter: UNUserNotificationCenterDelegate {
    /// Banners show even while the app is in front (the Portal window is often open).
    public nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }

    public nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        let box = UncheckedUserInfo(value: userInfo)
        Task { @MainActor in
            if response.actionIdentifier == UNNotificationDefaultActionIdentifier { self.route(box.value) }
            completionHandler()
        }
    }
}

/// userInfo is a plist dictionary; it crosses to the main actor unchanged.
private struct UncheckedUserInfo: @unchecked Sendable {
    let value: [AnyHashable: Any]
}
