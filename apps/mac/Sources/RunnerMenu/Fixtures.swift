import Combine
import Foundation
import RunnerSupervisor

/// The four approved menu states from fixture data, for SwiftUI previews and
/// for a debug run with no runner paired:
///
///     -RunnerFixture ready | working | paused | attention
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
        case "paused":
            base.activity = .paused
            return base
        case "attention":
            base.attention = .github
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
