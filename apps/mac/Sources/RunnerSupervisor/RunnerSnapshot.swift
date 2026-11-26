import Foundation

/// What the supervisor knows about the runner, built from its state lines.
public struct RunnerSnapshot: Equatable, Sendable {
    public enum Activity: Equatable, Sendable {
        /// The process is starting and has not said who it is yet.
        case starting
        case idle
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
            activity = paused ? .paused : .idle
            attention = nil
        case .idle:
            activity = .idle
            attention = nil
        case let .working(work):
            activity = .working(work)
            attention = nil
        case let .finished(work, status):
            lastRun = LastRun(milestone: work.milestone, status: status, endedAt: now)
            if case .working = activity { activity = .idle }
        case .paused:
            activity = .paused
            attention = nil
        case let .attention(reason):
            attention = reason
        }
    }

    public var isWorking: Bool {
        if case .working = activity { return true }
        return false
    }
}
