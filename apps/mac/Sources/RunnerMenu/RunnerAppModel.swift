import AppKit
import Combine
import Foundation
import PortalWindow
import RunnerSupervisor

/// What the menu drives. RunnerSupervisor in the app; a fixture for previews
/// and for showing the four states with no runner paired.
@MainActor
public protocol RunnerControl: AnyObject {
    var state: AnyPublisher<(RunnerSnapshot, Bool), Never> { get }
    func start()
    func stop()
    func pause()
    func resume()
    func restart()
    func remove() async -> RemoveOutcome
}

extension RunnerSupervisor: RunnerControl {
    public var state: AnyPublisher<(RunnerSnapshot, Bool), Never> {
        $snapshot.combineLatest($pauseRequested).map { ($0, $1) }.eraseToAnyPublisher()
    }
}

/// Where Open Portal goes: the app's Portal window. Nil opens the browser.
@MainActor
public protocol PortalOpening: AnyObject {
    func show()
}

extension PortalWindowController: PortalOpening {}

/// The menu bar app's state and actions. It sits on top of the runner
/// supervisor and the Portal window, which never talk to each other.
@MainActor
public final class RunnerAppModel: ObservableObject {
    @Published public private(set) var menu: MenuState
    @Published public private(set) var runnerId: String?
    @Published public private(set) var loginItemOn: Bool
    @Published public private(set) var updateLine: UpdateLine
    @Published public private(set) var removing = false
    @Published public private(set) var removeMessage: String?

    public let policy: DeploymentPolicy
    private let control: RunnerControl
    private let loginItem: LoginItem
    private let notifier: AttentionNotifying
    public let updater: AppUpdater
    private var updateTimer: AnyCancellable?
    private let setUp: SetUpFlow
    private let opener: URLOpening
    private let portal: PortalOpening?
    private let now: () -> Date

    private var snapshot = RunnerSnapshot()
    private var pauseRequested = false
    private var notified: AttentionReason?
    private var bag = Set<AnyCancellable>()

    public init(
        policy: DeploymentPolicy,
        control: RunnerControl,
        loginItem: LoginItem,
        notifier: AttentionNotifying,
        updater: AppUpdater,
        setUp: SetUpFlow,
        opener: URLOpening,
        portal: PortalOpening? = nil,
        now: @escaping () -> Date = Date.init
    ) {
        self.policy = policy
        self.control = control
        self.loginItem = loginItem
        self.notifier = notifier
        self.updater = updater
        self.setUp = setUp
        self.opener = opener
        self.portal = portal
        self.now = now
        menu = MenuState.from(RunnerSnapshot(), pauseRequested: false, now: now())
        loginItemOn = loginItem.isEnabled
        updateLine = updater.line(working: false)
        updater.$phase
            .sink { [weak self] _ in DispatchQueue.main.async { self?.refresh() } }
            .store(in: &bag)

        control.state
            .sink { [weak self] snapshot, paused in self?.received(snapshot, paused: paused) }
            .store(in: &bag)
        // "Last run: … · 12m ago" stays current while the menu is open.
        Timer.publish(every: 60, on: .main, in: .common).autoconnect()
            .sink { [weak self] _ in self?.refresh() }
            .store(in: &bag)
        NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.control.stop() } }
            .store(in: &bag)
    }

    /// First launch: the checklist and pairing windows.
    public private(set) var setupWindows: SetupWindows?

    /// The app as shipped: the real supervisor and system services. A debug
    /// build launched with `-RunnerFixture ready|working|working-several|paused|attention`
    /// shows that state from fixture data and starts no runner, and one
    /// launched with `-SetupFixture <name>` shows the checklist from fixture
    /// data and runs no setup command (FixtureSetupSystem), and one
    /// launched with `-OpenPortalWindow YES` opens the Portal window at once.
    public static func live(arguments: UserDefaults = .standard) -> RunnerAppModel {
        let policy = DeploymentPolicy.current
        let opener = WorkspaceOpener()
        let loginItem = MainAppLoginItem()
        let control: RunnerControl
        var setupSystem: SetupSystem = LiveSetupSystem(policy: policy)
        var setupFixture: FixtureSetupSystem?
        var snapshotting = false
        #if DEBUG
        // Snapshots run on fixtures only: no runner and no setup command starts.
        snapshotting = SetupSnapshot.scheduleIfAsked(arguments: arguments)
        if let name = snapshotting ? "fresh" : arguments.string(forKey: "SetupFixture"), let fixture = FixtureSetupSystem(named: name) {
            setupFixture = fixture
            setupSystem = fixture
        }
        if let name = arguments.string(forKey: "RunnerFixture") ?? (setupFixture != nil ? "ready" : nil),
           let fixture = FixtureControl(named: name) {
            control = fixture
        } else {
            control = RunnerSupervisor(policy: policy)
        }
        if arguments.bool(forKey: "OpenPortalWindow") {
            DispatchQueue.main.async { PortalWindowController.shared.show() }
        }
        #else
        control = RunnerSupervisor(policy: policy)
        #endif
        var releases: ReleaseSource = RunnerReleaseSource(policy: policy)
        var forwarded: [String] = []
        #if DEBUG
        if let file = arguments.string(forKey: "UpdateRelease") { releases = FileReleaseSource(file: URL(fileURLWithPath: file)) }
        if let fixture = arguments.string(forKey: "RunnerFixture") { forwarded = ["-RunnerFixture", fixture] }
        #endif
        let updater = AppUpdater(
            current: AppBuild.of(.main),
            source: releases,
            workspace: LiveUpdateWorkspace(),
            swapper: LiveAppSwapper(extraArguments: forwarded),
            stopRunner: { control.stop() },
            startRunner: { control.start() }
        )
        UpdateCheckIn.writeIfAsked(arguments: arguments)
        let setup = SetupModel(policy: policy, system: setupSystem, facts: setupFixture?.facts, showsPairing: setupFixture?.showsPairing ?? false)
        let windows = SetupWindows(model: setup)
        let model = RunnerAppModel(
            policy: policy,
            control: control,
            loginItem: loginItem,
            notifier: SystemNotifier(),
            updater: updater,
            setUp: windows,
            opener: opener,
            portal: PortalWindowController.shared
        )
        model.setupWindows = windows
        loginItem.enableOnFirstLaunch(policy: policy)
        model.loginItemOn = loginItem.isEnabled

        setup.onComplete = { [weak windows, weak model] newPairing in
            windows?.closeChecklist()
            if newPairing { control.restart() } else { control.start() }
            model?.startUpdateChecks()
        }
        // The runner starts only with a pairing this build may use and no old
        // launchd agent still running the same runner at login.
        if setup.readyWithoutChecklist && setupFixture == nil {
            control.start()
            model.startUpdateChecks()
        } else if arguments.string(forKey: "UpdateRelease") != nil, !policy.production {
            // Debug: try the update end to end on a fixture release.
            model.startUpdateChecks()
        } else if !snapshotting {
            DispatchQueue.main.async { windows.showChecklist() }
        }
        return model
    }

    // MARK: - State

    private func received(_ snapshot: RunnerSnapshot, paused: Bool) {
        self.snapshot = snapshot
        pauseRequested = paused
        runnerId = snapshot.runnerId
        refresh()
        notifyIfNeeded(snapshot.attention)
        updater.runnerChanged(snapshot)
    }

    private func refresh() {
        menu = MenuState.from(snapshot, pauseRequested: pauseRequested, now: now())
        updateLine = updater.line(working: snapshot.isWorking)
    }

    /// Self-update checks: now, then every six hours. They start once the app
    /// runs its own runner, since the check goes through the runner's secret.
    public func startUpdateChecks() {
        guard updateTimer == nil else { return }
        checkForUpdate()
        updateTimer = Timer.publish(every: AppUpdateRule.checkInterval, on: .main, in: .common).autoconnect()
            .sink { [weak self] _ in self?.checkForUpdate() }
    }

    /// One notification per reason, when it first appears and only if a person must act.
    private func notifyIfNeeded(_ reason: AttentionReason?) {
        guard let reason else { notified = nil; return }
        guard reason != notified else { return }
        notified = reason
        guard reason.needsPerson else { return }
        notifier.notify(title: "Warehaus runner needs you", body: MenuState.message(for: reason))
    }

    // MARK: - Actions

    public func perform(_ action: MenuAction) {
        switch action {
        case .pause, .pauseAfterRun: control.pause()
        case .resume, .cancelPauseAfterRun: control.resume()
        case .openPortal: openPortal(policy.portalURL)
        case let .openMilestone(id): openPortal(PortalLinks.milestone(id, policy: policy))
        case .signInToGitHub: setUp.signInToGitHub()
        case .pairAgain: setUp.pair()
        case .checkForUpdate: checkForUpdate()
        case .restartRunner: control.restart()
        }
    }

    /// The Portal window when there is one; the browser otherwise.
    private func openPortal(_ url: URL) {
        if let portal { portal.show() } else { opener.open(url) }
    }

    public func checkForUpdate() {
        Task { await updater.check() }
    }

    public func toggleLoginItem() {
        do {
            try loginItem.setEnabled(!loginItem.isEnabled)
        } catch {
            notifier.notify(title: "Start at login didn't change", body: error.localizedDescription)
        }
        loginItemOn = loginItem.isEnabled
    }

    public func clearRemoveMessage() {
        removeMessage = nil
    }

    /// Remove this runner, after the confirm dialog. Returns true when the
    /// dialog can close.
    public func remove() async -> Bool {
        removing = true
        defer { removing = false }
        let outcome = await control.remove()
        switch outcome {
        case .removed, .removedNotRevoked:
            if loginItem.isEnabled { try? loginItem.setEnabled(false) }
            loginItemOn = loginItem.isEnabled
            if outcome == .removedNotRevoked {
                let id = runnerId ?? "This runner"
                notifier.notify(
                    title: "Revoke \(id) in the Portal",
                    body: "It was removed from this Mac, but the Portal couldn't be reached. Revoke it under Manage runners."
                )
            }
            removeMessage = nil
            return true
        case .keychainFailed:
            removeMessage = "The runner was revoked, but its secret couldn't be deleted from the Keychain. Delete the warehaus-runner item in Keychain Access."
            return false
        case .failed:
            removeMessage = "The runner couldn't be removed. Try again, or revoke it in the Portal."
            return false
        }
    }

    public func quit() {
        control.stop()
        NSApp.terminate(nil)
    }
}
