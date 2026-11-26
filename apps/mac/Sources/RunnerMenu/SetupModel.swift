import AppKit
import Combine
import Foundation
import RunnerSupervisor

/// First launch: the checklist's facts and the clicks that change them.
/// Read-only checks run on their own; every command that installs, signs in,
/// pairs or removes the old agent waits for a click.
@MainActor
public final class SetupModel: ObservableObject {
    @Published public private(set) var facts: SetupFacts
    @Published public private(set) var now: Date
    /// The pairing window is up.
    @Published public private(set) var showsPairing = false

    public let policy: DeploymentPolicy
    private let system: SetupSystem
    private var pairingRun: SetupCancel?
    private var clock: AnyCancellable?
    /// Called each time the checklist becomes complete. `newPairing` is true
    /// when this Mac was just paired, so a running runner must restart.
    public var onComplete: ((_ newPairing: Bool) -> Void)?
    private var wasComplete = false

    public init(policy: DeploymentPolicy, system: SetupSystem, facts: SetupFacts? = nil, showsPairing: Bool = false, now: Date = Date()) {
        self.showsPairing = showsPairing
        self.policy = policy
        self.system = system
        self.now = now
        if let facts {
            self.facts = facts
        } else {
            let takeover = system.takeover()
            self.facts = SetupFacts(
                pair: takeover.adopt.map { .adopted(runnerId: $0.runnerId) } ?? .notPaired,
                oldAgent: takeover.oldAgent
            )
        }
    }

    public var checklist: ChecklistState { ChecklistState.from(facts, policy: policy) }

    public var pairingCode: PairingCode? {
        if case let .pairing(code) = facts.pair { return code }
        return nil
    }

    /// True when the app can start its runner without showing the checklist:
    /// a pairing this build may use and no old agent still starting at login.
    public var readyWithoutChecklist: Bool {
        switch facts.pair {
        case .adopted, .paired: break
        default: return false
        }
        switch facts.oldAgent {
        case .none, .leftAlone: return true
        default: return false
        }
    }

    /// The read-only checks: `gh auth status` and `claude auth status`.
    public func check() async {
        facts.github = await system.githubStatus()
        facts.claude = await system.claudeStatus()
        settle()
    }

    public func perform(_ action: ChecklistAction) {
        switch action {
        case .signInToGitHub:
            facts.github = .signingIn(code: nil)
            Task {
                let result = await system.githubSignIn { [weak self] code in self?.facts.github = .signingIn(code: code) }
                facts.github = result
                settle()
            }
        case .installClaude:
            facts.claude = .installing
            Task {
                facts.claude = await system.installClaude()
                if facts.claude == .signedOut { perform(.signInToClaude) }
                settle()
            }
        case .signInToClaude:
            facts.claude = .signingIn
            Task {
                facts.claude = await system.claudeSignIn()
                settle()
            }
        case .retry(.claude):
            facts.claude = .checking
            Task {
                facts.claude = await system.claudeStatus()
                settle()
            }
        case .retry(.github):
            facts.github = .checking
            Task {
                facts.github = await system.githubStatus()
                settle()
            }
        case .pair, .retry(.pair):
            startPairing()
        case .replaceOldAgent:
            replaceOldAgent()
        }
    }

    // MARK: Pairing

    private func startPairing() {
        pairingRun?.cancel()
        facts.pair = .notPaired
        let run = system.startPairing { [weak self] event in self?.received(event) }
        guard let run else {
            facts.pair = .failed("The runner files are missing. Download the app again from the Portal.")
            return
        }
        pairingRun = run
    }

    private func received(_ event: PairingEvent?) {
        switch event {
        case let .pairing(code):
            facts.pair = .pairing(code)
            showsPairing = true
            openPortalForPairing()
            clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
                .sink { [weak self] date in self?.now = date }
        case let .paired(id):
            facts.pair = .paired(runnerId: id)
            finishPairing()
        case .expired:
            facts.pair = .expired
            finishPairing()
        case nil:
            if case .pairing = facts.pair { facts.pair = .failed("Pairing stopped. Try again.") }
            if case .notPaired = facts.pair { facts.pair = .failed("Couldn't reach the Portal. Try again.") }
            finishPairing()
        }
        settle()
    }

    private func finishPairing() {
        pairingRun = nil
        clock = nil
        showsPairing = false
    }

    /// The Portal with the code filled in, for one Confirm and pair click.
    public func openPortalForPairing() {
        guard let code = pairingCode else { return }
        system.open(policy.pairingURL(code: code.code))
    }

    public func cancelPairing() {
        pairingRun?.cancel()
        facts.pair = .notPaired
        finishPairing()
    }

    // MARK: The old agent

    private func replaceOldAgent() {
        guard case let .present(label) = facts.oldAgent else {
            if case let .failed(label, _) = facts.oldAgent { facts.oldAgent = .present(label: label); replaceOldAgent() }
            return
        }
        facts.oldAgent = .replacing(label: label)
        Task {
            if let problem = await system.removeOldAgent() {
                facts.oldAgent = .failed(label: label, message: problem)
            } else {
                facts.oldAgent = .none
            }
            settle()
        }
    }

    private func settle() {
        let complete = checklist.complete
        defer { wasComplete = complete }
        guard complete, !wasComplete else { return }
        if case .paired = facts.pair { onComplete?(true) } else { onComplete?(false) }
    }
}
