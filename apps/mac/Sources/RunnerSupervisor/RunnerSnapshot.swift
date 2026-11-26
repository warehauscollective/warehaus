import Foundation

/// What the supervisor knows about the runner, built from its state lines.
public struct RunnerSnapshot: Equatable, Sendable {
    public enum Activity: Equatable, Sendable {
        /// The process is starting and has not said who it is yet.
        case starting
        case idle
        /// The first run in progress. `runs` holds all of them.
        case working(WorkInfo)
        case paused
        /// No runner process: quit, removed, or never started.
        case stopped
    }

    public struct LastRun: Equatable, Sendable {
        public var milestone: String
        public var status: String
        public var endedAt: Date

        public init(milestone: String, status: String, endedAt: Date) {
            self.milestone = milestone
            self.status = status
            self.endedAt = endedAt
        }
    }

    public var runnerId: String?
    public var production: Bool
    public var activity: Activity
    public var attention: AttentionReason?
    public var lastRun: LastRun?
    /// Every run in progress, oldest first: one per milestone, up to the runner's slots.
    public var runs: [WorkInfo] = []
    /// Claude hit its usage limit: the runner takes no new work until this time.
    public var usageLimitUntil: Date?

    public init(
        runnerId: String? = nil,
        production: Bool = false,
        activity: Activity = .stopped,
        attention: AttentionReason? = nil,
        lastRun: LastRun? = nil
    ) {
        self.runnerId = runnerId
        self.production = production
        self.activity = activity
        self.attention = attention
        self.lastRun = lastRun
    }

    /// Folds one state line in. A line that shows the runner working normally
    /// (idle, working, paused) clears an attention reason the runner raised.
    public mutating func apply(_ event: RunnerEvent, at now: Date) {
        switch event {
        case let .started(runnerId, production, paused):
            self.runnerId = runnerId
            self.production = production
            runs = []
            activity = paused ? .paused : .idle
            attention = nil
            usageLimitUntil = nil
        case .idle:
            // The runner only claims again once the limit has reset, so either line ends the wait.
            runs = []
            activity = .idle
            attention = nil
            usageLimitUntil = nil
        case let .working(work):
            if let index = runs.firstIndex(where: { $0.runId == work.runId }) {
                runs[index] = work
            } else {
                runs.append(work)
            }
            activity = .working(runs[0])
            attention = nil
            usageLimitUntil = nil
        case let .finished(work, status):
            runs.removeAll { $0.runId == work.runId }
            // A Cursor build still going comes back; it is not a finished run.
            if status != "running" {
                lastRun = LastRun(milestone: work.milestone, status: status, endedAt: now)
            }
            if case .working = activity { activity = runs.first.map(Activity.working) ?? .idle }
        case .paused:
            runs = []
            activity = .paused
            attention = nil
        case let .attention(reason):
            attention = reason
        case let .waiting(.usageLimit, until):
            // No reset time: the runner backs off for half an hour.
            usageLimitUntil = until ?? now.addingTimeInterval(30 * 60)
        }
    }

    /// The usage-limit wait, while it lasts.
    public func usageLimitWait(at now: Date) -> Date? {
        guard let until = usageLimitUntil, until > now else { return nil }
        return until
    }

    public var isWorking: Bool {
        if case .working = activity { return true }
        return false
    }
}
