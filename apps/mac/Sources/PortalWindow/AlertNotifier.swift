import AppKit
import UserNotifications

/// Posts the window's notifications and sets the Dock badge. A protocol so the
/// window's attention handling can be driven by a fake.
@MainActor
public protocol AlertNotifying: AnyObject {
    func permission() async -> NotificationPermission
    /// Shows the system prompt the first time; later calls return the answer.
    func requestPermission() async -> NotificationPermission
    func post(_ content: AlertNotificationContent)
    func setBadge(_ label: String?)
}

@MainActor
public final class SystemAlertNotifier: AlertNotifying {
    nonisolated public init() {}

    /// A bare binary (swift test) has no bundle id, and UNUserNotificationCenter traps without one.
    private var center: UNUserNotificationCenter? {
        Bundle.main.bundleIdentifier == nil ? nil : .current()
    }

    public func permission() async -> NotificationPermission {
        guard let center else { return .denied }
        return Self.permission(await center.notificationSettings().authorizationStatus)
    }

    public func requestPermission() async -> NotificationPermission {
        guard let center else { return .denied }
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        return await permission()
    }

    public func post(_ content: AlertNotificationContent) {
        guard let center else { return }
        let note = UNMutableNotificationContent()
        note.title = content.title
        note.body = content.body
        note.sound = .default
        note.userInfo = content.userInfo
        center.add(UNNotificationRequest(identifier: content.identifier, content: note, trigger: nil))
    }

    public func setBadge(_ label: String?) {
        NSApp.dockTile.badgeLabel = label
    }

    nonisolated static func permission(_ status: UNAuthorizationStatus) -> NotificationPermission {
        switch status {
        case .authorized, .provisional, .ephemeral: return .authorized
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }
}
