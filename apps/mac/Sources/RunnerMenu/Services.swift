import AppKit
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
            center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
        }
        if asked { return post() }
        asked = true
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            if granted { post() }
        }
    }
}

// MARK: - Updates (stub until the self-update task)

public enum UpdateStatus: Equatable, Sendable {
    case upToDate(version: String)
    case available(version: String)
    case checking(version: String)
}

/// The update line and Check for update. The self-update task replaces the
/// stub with a real check against `/agent/app-release` that installs between runs.
@MainActor
public protocol UpdateChecking {
    var status: UpdateStatus { get }
    func checkNow() async -> UpdateStatus
}

@MainActor
public final class StubUpdateChecker: UpdateChecking {
    public let version: String

    public init(version: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev") {
        self.version = version
    }

    public var status: UpdateStatus { .upToDate(version: version) }

    public func checkNow() async -> UpdateStatus { .upToDate(version: version) }
}

// MARK: - Set-up (stub until the first-launch task)

/// Pairing and GitHub sign-in. The first-launch task replaces this with the
/// checklist and pairing windows from the design.
@MainActor
public protocol SetUpFlow {
    func pair()
    func signInToGitHub()
}

@MainActor
public final class BrowserSetUpFlow: SetUpFlow {
    private let opener: URLOpening
    private let policy: DeploymentPolicy

    public init(opener: URLOpening, policy: DeploymentPolicy) {
        self.opener = opener
        self.policy = policy
    }

    /// For now: the Portal, where staff set up a runner from the runner chip.
    public func pair() { opener.open(policy.portalURL) }

    public func signInToGitHub() { opener.open(URL(string: "https://github.com/login")!) }
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
