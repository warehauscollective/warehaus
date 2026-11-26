import Combine
import Foundation
import RunnerSupervisor

/// The approved menu states from fixture data, for SwiftUI previews and
/// for a debug run with no runner paired:
///
///     -RunnerFixture ready | working | working-several | paused | attention
///                    | waiting | waiting-working
///
/// Pause and Resume work on the fixture so the states can be clicked through.
@MainActor
public final class FixtureControl: RunnerControl {
    private let subject: CurrentValueSubject<(RunnerSnapshot, Bool), Never>

    public init(snapshot: RunnerSnapshot, paused: Bool = false) {
        subject = CurrentValueSubject((snapshot, paused))
    }

    public convenience init?(named name: String, now: Date = Date()) {
        guard let snapshot = Self.snapshot(named: name, now: now) else { return nil }
        self.init(snapshot: snapshot, paused: name == "paused")
    }

    public static func snapshot(named name: String, now: Date = Date()) -> RunnerSnapshot? {
        var base = RunnerSnapshot(runnerId: "peter-mbp-prod", production: true, activity: .idle)
        base.lastRun = .init(milestone: "Client portal approvals", status: "done", endedAt: now.addingTimeInterval(-12 * 60))
        switch name {
        case "ready":
            return base
        case "working":
            base.activity = .working(WorkInfo(kind: .task, milestoneId: "fixture-milestone", milestone: "Client experience launch", taskOrder: 3, task: "Hero"))
            return base
        case "working-several":
            base.runs = [
                WorkInfo(runId: "r1", kind: .task, milestoneId: "fixture-milestone", milestone: "Client experience launch", taskOrder: 3, task: "Hero"),
                WorkInfo(runId: "r2", kind: .planning, milestoneId: "fixture-milestone-2", milestone: "Double booking awareness"),
                WorkInfo(runId: "r3", kind: .task, milestoneId: "fixture-milestone-3", milestone: "Figma status picker", taskOrder: 1, task: "Picker"),
            ]
            base.activity = .working(base.runs[0])
            return base
        case "paused":
            base.activity = .paused
            return base
        case "attention":
            base.attention = .github
            return base
        case "waiting":
            base.usageLimitUntil = now.addingTimeInterval(5 * 60 * 60 + 21 * 60)
            return base
        case "waiting-working":
            base.runs = [
                WorkInfo(runId: "r1", kind: .task, milestoneId: "fixture-milestone", milestone: "Client experience launch", taskOrder: 3, task: "Hero"),
                WorkInfo(runId: "r2", kind: .task, milestoneId: "fixture-milestone-3", milestone: "Milestone tasks as a board", taskOrder: 5, task: "Board"),
            ]
            base.activity = .working(base.runs[0])
            base.usageLimitUntil = now.addingTimeInterval(5 * 60 * 60 + 21 * 60)
            return base
        default:
            return nil
        }
    }

    public var state: AnyPublisher<(RunnerSnapshot, Bool), Never> { subject.eraseToAnyPublisher() }

    public func start() {}
    public func stop() {}
    public func restart() {}

    public func pause() {
        var (snapshot, _) = subject.value
        if !snapshot.isWorking { snapshot.activity = .paused }
        subject.send((snapshot, true))
    }

    public func resume() {
        var (snapshot, _) = subject.value
        if snapshot.activity == .paused { snapshot.activity = .idle }
        subject.send((snapshot, false))
    }

    public func remove() async -> RemoveOutcome {
        subject.send((RunnerSnapshot(production: true, activity: .stopped, attention: .notPaired), false))
        return .removed
    }
}

/// First launch from fixture data, for screenshots and a debug run that must
/// not touch this Mac's real gh, Claude Code, pairing or launchd agent:
///
///     -SetupFixture fresh | signed-out | github-code | installing | claude-signin
///                   | pairing | expired | takeover | done
///
/// Clicks move the fixture along without running any command.
@MainActor
public final class FixtureSetupSystem: SetupSystem {
    public static let names = ["fresh", "signed-out", "github-code", "installing", "claude-signin", "pairing", "expired", "takeover", "done"]

    public let facts: SetupFacts
    public let showsPairing: Bool

    public init?(named name: String, now: Date = Date()) {
        let signedIn = GitHubFact.signedIn(login: "peterroquemore")
        let code = PairingCode(code: "K7QM-4XPA", runnerId: "peter-mbp-prod", expiresAt: now.addingTimeInterval(9 * 60 + 41))
        var pairing = false
        switch name {
        case "fresh": facts = SetupFacts(github: signedIn, claude: .missing)
        case "signed-out": facts = SetupFacts(github: .signedOut, claude: .missing)
        case "github-code": facts = SetupFacts(github: .signingIn(code: "1A2B-3C4D"), claude: .missing)
        case "installing": facts = SetupFacts(github: signedIn, claude: .installing)
        case "claude-signin": facts = SetupFacts(github: signedIn, claude: .signedOut)
        case "pairing":
            facts = SetupFacts(github: signedIn, claude: .signedIn(email: nil), pair: .pairing(code))
            pairing = true
        case "expired": facts = SetupFacts(github: signedIn, claude: .signedIn(email: nil), pair: .expired)
        case "takeover":
            facts = SetupFacts(github: signedIn, claude: .signedIn(email: nil), pair: .adopted(runnerId: "peter-mbp-prod"),
                               oldAgent: .present(label: "co.warehaus.runner.prod"))
        case "done": facts = SetupFacts(github: signedIn, claude: .signedIn(email: nil), pair: .paired(runnerId: "peter-mbp-prod"))
        default: return nil
        }
        showsPairing = pairing
    }

    public func githubStatus() async -> GitHubFact { facts.github }
    public func githubSignIn(code: @escaping @MainActor (String) -> Void) async -> GitHubFact {
        code("1A2B-3C4D")
        try? await Task.sleep(for: .seconds(2))
        return .signedIn(login: "peterroquemore")
    }
    public func claudeStatus() async -> ClaudeFact { facts.claude }
    public func installClaude() async -> ClaudeFact {
        try? await Task.sleep(for: .seconds(2))
        return .signedOut
    }
    public func claudeSignIn() async -> ClaudeFact {
        try? await Task.sleep(for: .seconds(2))
        return .signedIn(email: nil)
    }
    public func takeover() -> Takeover { Takeover(adopt: nil, oldAgent: facts.oldAgent) }
    public func removeOldAgent() async -> String? {
        try? await Task.sleep(for: .seconds(1))
        return nil
    }
    public func startPairing(_ events: @escaping @MainActor (PairingEvent?) -> Void) -> SetupCancel? {
        let code = PairingCode(code: "K7QM-4XPA", runnerId: "peter-mbp-prod", expiresAt: Date().addingTimeInterval(600))
        events(.pairing(code))
        let cancel = FixtureCancel()
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(6))
            if !cancel.cancelled { events(.paired(runnerId: code.runnerId)) }
        }
        return cancel
    }
    public func open(_ url: URL) {}
}

final class FixtureCancel: SetupCancel {
    var cancelled = false
    func cancel() { cancelled = true }
}
