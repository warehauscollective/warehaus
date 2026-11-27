import Foundation
import NativeBridge

/// What the window does with the page's `attention` messages (ADR-0006,
/// decision 5: the rules for who sees what live in Convex; the shell only
/// shows the count and notifies new alerts). Pure, so it is tested without
/// a notification center.

/// The ids of alerts already shown, newest last, at most `limit`. Kept so a
/// reload or relaunch never notifies the same alert twice.
public protocol SeenAlertStoring: AnyObject {
    var ids: [String] { get set }
}

public final class DefaultsSeenAlertStore: SeenAlertStoring {
    public static let key = "PortalSeenAlertIds"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var ids: [String] {
        get { defaults.stringArray(forKey: Self.key) ?? [] }
        set { defaults.set(newValue, forKey: Self.key) }
    }
}

public final class MemorySeenAlertStore: SeenAlertStoring {
    public var ids: [String]
    public init(ids: [String] = []) { self.ids = ids }
}

/// Decides which alerts are new. The first attention after launch only
/// seeds the store, so a backlog never floods the Mac with banners.
public struct AlertTracker {
    public static let limit = 200

    private let store: SeenAlertStoring
    private var seeded = false

    public init(store: SeenAlertStoring) {
        self.store = store
    }

    /// The alerts to notify, in the order the page sent them.
    public mutating func receive(_ alerts: [AttentionAlert]) -> [AttentionAlert] {
        var seen = store.ids
        let known = Set(seen)
        var fresh: [AttentionAlert] = []
        var added = Set<String>()
        for alert in alerts where !known.contains(alert.id) && !added.contains(alert.id) {
            added.insert(alert.id)
            fresh.append(alert)
            seen.append(alert.id)
        }
        if seen.count > Self.limit { seen.removeFirst(seen.count - Self.limit) }
        if !fresh.isEmpty { store.ids = seen }
        defer { seeded = true }
        return seeded ? fresh : []
    }
}

/// The Dock badge for a count: nothing at 0.
public enum DockBadge {
    public static func label(count: Int) -> String? {
        count > 0 ? String(count) : nil
    }
}

/// A notification's words, from the approved design (Figma, Projects /
/// Mac app / Needs you and Ready to Ship notifications).
public struct AlertNotificationContent: Equatable, Sendable {
    /// The userInfo source the notification router sends clicks back by.
    public static let source = "portal"
    public static let urlKey = "url"

    public let identifier: String
    public let title: String
    public let body: String
    /// The alert's raw warehaus:// link. Handed back to the page on click, never parsed here.
    public let url: String

    public init(_ alert: AttentionAlert) {
        identifier = "portal.alert.\(alert.id)"
        url = alert.url
        switch alert.kind {
        case .ask:
            title = "Needs you: \(alert.title)"
            body = "Ready to Ship and waiting on your approval. Approve it or request changes."
        case .readyToShip:
            title = "Ready to Ship: \(alert.title)"
            body = "The local preview is ready. Open the milestone to review it."
        }
    }

    public var userInfo: [String: String] {
        ["source": Self.source, Self.urlKey: url]
    }

    /// The link a clicked notification carries, or nil when it is not one of ours.
    public static func link(fromUserInfo userInfo: [AnyHashable: Any]) -> String? {
        guard userInfo["source"] as? String == source, let url = userInfo[urlKey] as? String else { return nil }
        return PortalLink.accept(url)
    }
}

/// Notification permission as the window sees it.
public enum NotificationPermission: Equatable, Sendable {
    case notDetermined, authorized, denied

    /// The hello's capabilities: the badge always works; notify only when the
    /// Mac lets the app notify.
    public var capabilities: [ShellCapability] {
        self == .authorized ? [.badge, .notify, .openExternal] : [.badge, .openExternal]
    }
}
