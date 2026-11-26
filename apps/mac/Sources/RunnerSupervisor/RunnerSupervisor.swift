import Combine
import Foundation
import os

/// Where the person's Pause choice is kept, so the app starts paused again
/// after a restart or a login.
public protocol PauseStoring {
    var paused: Bool { get set }
}

public final class DefaultsPauseStore: PauseStoring {
    private let defaults: UserDefaults
    private let key = "runnerPaused"

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var paused: Bool {
        get { defaults.bool(forKey: key) }
        set { defaults.set(newValue, forKey: key) }
    }
}

/// What Remove this runner did (exit codes of `npm run runner -- remove`).
public enum RemoveOutcome: Equatable, Sendable {
    /// Revoked in the Portal, launchd agent removed, Keychain secret deleted.
    case removed
    /// Removed from this Mac, but the Portal could not be reached to revoke it.
    case removedNotRevoked
    /// The Keychain entry could not be deleted.
    case keychainFailed
    /// The runner could not be found or the command failed.
    case failed
}

/// Starts the bundled Node runner as a headless child process, reads its
/// state lines, and passes Pause, Resume and Remove to it.
///
/// This module knows nothing about the menu or the Portal window. It never
/// imports either (ADR-0006, decision 8).
@MainActor
public final class RunnerSupervisor: ObservableObject {
    @Published public private(set) var snapshot = RunnerSnapshot()
    @Published public private(set) var pauseRequested: Bool

    public let policy: DeploymentPolicy
    private let pairing: PairingReading
    private let locator: RunnerLocating
    private let processes: RunnerProcessMaking
    private var pauseStore: PauseStoring
    private let now: () -> Date
    private let schedule: (TimeInterval, @escaping @MainActor () -> Void) -> Void
    private let log = Logger(subsystem: "co.warehaus.runner.app", category: "runner")

    private var process: RunnerProcess?
    private var stopping = false
    private var exits: [Date] = []
    private var restartAttempt = 0

    /// The process stopping this often in this window is Needs attention.
    static let keepsStoppingCount = 3
    static let keepsStoppingWindow: TimeInterval = 5 * 60
    /// Waits before each restart, then the last one again.
    static let restartDelays: [TimeInterval] = [2, 5, 15, 30, 60]

    public init(
        policy: DeploymentPolicy = .current,
        pairing: PairingReading? = nil,
        locator: RunnerLocating? = nil,
        processes: RunnerProcessMaking = NodeRunnerProcesses(),
        pauseStore: PauseStoring = DefaultsPauseStore(),
        now: @escaping () -> Date = Date.init,
        schedule: ((TimeInterval, @escaping @MainActor () -> Void) -> Void)? = nil
    ) {
        self.policy = policy
        self.pairing = pairing ?? PairingFile(policy: policy)
        self.locator = locator ?? FirstFound.forPolicy(policy)
        self.processes = processes
        self.pauseStore = pauseStore
        self.now = now
        self.schedule = schedule ?? { delay, work in
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { MainActor.assumeIsolated { work() } }
        }
        pauseRequested = pauseStore.paused
    }

    /// The menu for this moment.
    public var menu: MenuState {
        MenuState.from(snapshot, pauseRequested: pauseRequested, now: now())
    }

    public var isRunning: Bool { process != nil }

    /// Starts the runner if this Mac is paired to a deployment this build may use.
    public func start() {
        guard process == nil else { return }
        stopping = false
        guard let saved = pairing.read() else { return needsAttention(.notPaired) }
        snapshot.runnerId = saved.runnerId
        snapshot.production = policy.production
        guard policy.allows(agentURL: saved.agentURL) else { return needsAttention(.wrongDeployment) }
        guard let installation = locator.locate() else { return needsAttention(.runnerMissing) }

        let child = processes.make(installation, arguments: policy.runnerArguments(paused: pauseRequested))
        child.onLine = { [weak self] line in self?.receive(line) }
        child.onExit = { [weak self] code in self?.exited(code) }
        do {
            try child.start()
        } catch {
            log.error("Could not start the runner: \(error.localizedDescription, privacy: .public)")
            return needsAttention(.runnerMissing)
        }
        process = child
        snapshot.activity = .starting
    }

    /// Quit, or before Remove. The runner gets SIGTERM; a run in progress is
    /// released by the Portal's sweep like any quiet runner.
    public func stop() {
        stopping = true
        process?.terminate()
        process = nil
        snapshot.activity = .stopped
    }

    public func restart() {
        stop()
        exits.removeAll()
        restartAttempt = 0
        snapshot.attention = nil
        start()
    }

    /// Takes no new work. A run in progress finishes first.
    public func pause() {
        setPaused(true)
        process?.send("pause")
        if !snapshot.isWorking, process != nil { snapshot.activity = .paused }
    }

    public func resume() {
        setPaused(false)
        process?.send("resume")
        if snapshot.activity == .paused { snapshot.activity = .idle }
    }

    /// Remove this runner, after the confirm dialog: stops the runner, then
    /// `remove` revokes it in the Portal, removes the launchd agent and
    /// deletes the Keychain secret. The caller removes the login item.
    public func remove() async -> RemoveOutcome {
        stop()
        guard let installation = locator.locate() else { return .failed }
        let code = await processes.run(installation, arguments: policy.removeArguments)
        let outcome = RemoveOutcome(exitCode: code)
        if outcome != .failed {
            setPaused(false)
            snapshot = RunnerSnapshot(production: policy.production, activity: .stopped, attention: .notPaired)
        }
        return outcome
    }

    // MARK: - Runner output

    func receive(_ line: String) {
        guard let event = RunnerEvent.parse(line: line) else {
            if !line.isEmpty { log.info("\(line, privacy: .public)") }
            return
        }
        snapshot.apply(event, at: now())
        if case .working = event { restartAttempt = 0 }
        if case .idle = event { restartAttempt = 0 }
    }

    func exited(_ code: Int32) {
        process = nil
        guard !stopping else { return }
        log.error("Runner stopped with code \(code)")
        // Not paired: restarting cannot help until the person pairs.
        if snapshot.attention == .notPaired { snapshot.activity = .stopped; return }
        let at = now()
        exits = exits.filter { at.timeIntervalSince($0) < Self.keepsStoppingWindow } + [at]
        if exits.count >= Self.keepsStoppingCount { snapshot.attention = .keepsStopping }
        snapshot.activity = .stopped
        let delays = Self.restartDelays
        let delay = delays[min(restartAttempt, delays.count - 1)]
        restartAttempt += 1
        schedule(delay) { [weak self] in
            guard let self, !self.stopping, self.process == nil else { return }
            self.start()
        }
    }

    private func needsAttention(_ reason: AttentionReason) {
        snapshot.attention = reason
        snapshot.activity = .stopped
    }

    private func setPaused(_ value: Bool) {
        pauseRequested = value
        pauseStore.paused = value
    }
}

extension RemoveOutcome {
    init(exitCode: Int32) {
        switch exitCode {
        case 0: self = .removed
        case 3: self = .removedNotRevoked
        case 4: self = .keychainFailed
        default: self = .failed
        }
    }
}
