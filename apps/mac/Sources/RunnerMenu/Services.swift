import AppKit
import NotificationRouting
import Foundation
import ServiceManagement
import UserNotifications
import RunnerSupervisor
import os

// Small seams around system services, so the model stays testable and the
// tasks still to come (first launch, self-update) plug in without touching it.

// MARK: - Start at login

public protocol LoginItem: AnyObject {
    var isEnabled: Bool { get }
    func setEnabled(_ enabled: Bool) throws
}

/// The app itself as a login item, through SMAppService.mainApp (macOS 13+).
/// It replaces the old `co.warehaus.runner.prod` launchd agent; the first-launch
/// task removes that agent when it takes over a pairing.
public final class MainAppLoginItem: LoginItem {
    private let log = Logger(subsystem: "co.warehaus.runner.app", category: "login-item")
    private let defaults: UserDefaults
    private let configuredKey = "loginItemConfigured"

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var isEnabled: Bool { SMAppService.mainApp.status == .enabled }

    public func setEnabled(_ enabled: Bool) throws {
        if enabled {
            try SMAppService.mainApp.register()
        } else {
            try SMAppService.mainApp.unregister()
        }
        defaults.set(true, forKey: configuredKey)
    }

    /// Release builds start at login from the first launch (the milestone goal
    /// "Starts at login"). Once the person turns it off, it stays off. Debug
    /// builds from Xcode never register themselves.
    public func enableOnFirstLaunch(policy: DeploymentPolicy) {
        guard policy.production, !defaults.bool(forKey: configuredKey) else { return }
        do {
            try setEnabled(true)
        } catch {
            log.error("Could not add the login item: \(error.localizedDescription, privacy: .public)")
        }
    }
}

// MARK: - Notifications

/// Notifications only when the person must act (AttentionReason.needsPerson).
/// Nothing for Working, Done, Paused or a Portal that is briefly unreachable.
public protocol AttentionNotifying {
    func notify(title: String, body: String)
}

public final class SystemNotifier: AttentionNotifying {
    /// The notification router's source for the runner's act-only notifications.
    public static let source = "runner"
    private var asked = false

    public init() {}

    public func notify(title: String, body: String) {
        // A bare binary has no bundle id, and UNUserNotificationCenter traps without one.
        guard Bundle.main.bundleIdentifier != nil else { return }
        let center = UNUserNotificationCenter.current()
        let post = {
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.userInfo = [NotificationRouter.sourceKey: Self.source]
            center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
        }
        if asked { return post() }
        asked = true
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            if granted { post() }
        }
    }
}

// MARK: - Set-up

/// Pairing and GitHub sign-in from the menu. SetupWindows opens the checklist.
@MainActor
public protocol SetUpFlow {
    func pair()
    func signInToGitHub()
}

// MARK: - Links

public protocol URLOpening {
    func open(_ url: URL)
}

public struct WorkspaceOpener: URLOpening {
    public init() {}
    public func open(_ url: URL) { NSWorkspace.shared.open(url) }
}

public enum PortalLinks {
    /// The Portal has no milestone URL yet (milestones open inside the project
    /// page), so this opens Projects. Swap in the project link once the runner
    /// sends the project id with its work.
    public static func milestone(_ id: String, policy: DeploymentPolicy) -> URL {
        policy.portalURL
    }
}
