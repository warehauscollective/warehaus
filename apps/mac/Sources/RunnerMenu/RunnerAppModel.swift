import AppKit
import Combine
import Foundation
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

/// The menu bar app's state and actions. It sits on top of the runner
/// supervisor; the Portal window will sit beside it, never inside it.
@MainActor
public final class RunnerAppModel: ObservableObject {
    @Published public private(set) var menu: MenuState
    @Published public private(set) var runnerId: String?
    @Published public private(set) var loginItemOn: Bool
    @Published public private(set) var update: UpdateStatus
    @Published public private(set) var removing = false
    @Published public private(set) var removeMessage: String?

    public let policy: DeploymentPolicy
    private let control: RunnerControl
    private let loginItem: LoginItem
    private let notifier: AttentionNotifying
    private let updates: UpdateChecking
    private let setUp: SetUpFlow
    private let opener: URLOpening
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
        updates: UpdateChecking,
        setUp: SetUpFlow,
        opener: URLOpening,
        now: @escaping () -> Date = Date.init
    ) {
        self.policy = policy
        self.control = control
        self.loginItem = loginItem
        self.notifier = notifier
        self.updates = updates
        self.setUp = setUp
        self.opener = opener
        self.now = now
        menu = MenuState.from(RunnerSnapshot(), pauseRequested: false, now: now())
        loginItemOn = loginItem.isEnabled
        update = updates.status

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

    /// The app as shipped: the real supervisor and system services. A debug
    /// build launched with `-RunnerFixture ready|working|paused|attention`
    /// shows that state from fixture data and starts no runner.
    public static func live(arguments: UserDefaults = .standard) -> RunnerAppModel {
        let policy = DeploymentPolicy.current
        let opener = WorkspaceOpener()
        let loginItem = MainAppLoginItem()
        let control: RunnerControl
        #if DEBUG
        if let name = arguments.string(forKey: "RunnerFixture"), let fixture = FixtureControl(named: name) {
            control = fixture
        } else {
            control = RunnerSupervisor(policy: policy)
        }
        #else
        control = RunnerSupervisor(policy: policy)
        #endif
        let model = RunnerAppModel(
            policy: policy,
            control: control,
            loginItem: loginItem,
            notifier: SystemNotifier(),
            updates: StubUpdateChecker(),
            setUp: BrowserSetUpFlow(opener: opener, policy: policy),
            opener: opener
        )
        loginItem.enableOnFirstLaunch(policy: policy)
        model.loginItemOn = loginItem.isEnabled
        control.start()
        return model
    }

    // MARK: - State

    private func received(_ snapshot: RunnerSnapshot, paused: Bool) {
        self.snapshot = snapshot
        pauseRequested = paused
        runnerId = snapshot.runnerId
        refresh()
        notifyIfNeeded(snapshot.attention)
    }

    private func refresh() {
        menu = MenuState.from(snapshot, pauseRequested: pauseRequested, now: now())
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
        case .openPortal: opener.open(policy.portalURL)
        case let .openMilestone(id): opener.open(PortalLinks.milestone(id, policy: policy))
        case .signInToGitHub: setUp.signInToGitHub()
        case .pairAgain: setUp.pair()
        case .checkForUpdate: checkForUpdate()
        case .restartRunner: control.restart()
        }
    }

    public func checkForUpdate() {
        let version: String
        switch update {
        case let .upToDate(current), let .available(current), let .checking(current): version = current
        }
        update = .checking(version: version)
        Task { update = await updates.checkNow() }
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
