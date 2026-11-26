import Foundation

/// Why the runner needs a person. The first five come from the runner's own
/// state lines (`ATTENTION_REASONS` in tools/runner/src/lib.mjs); the rest are
/// found by the supervisor before or after the runner process runs.
public enum AttentionReason: String, Codable, Sendable, CaseIterable {
    /// The Portal refused the runner's secret: it was revoked.
    case unauthorized
    /// The Portal refused the runner's protocol version.
    case outOfDate = "out_of_date"
    /// `gh` is signed out, so builds cannot push.
    case github
    /// Three Portal calls in a row failed. The runner keeps trying.
    case unreachable
    /// No runner id or Keychain secret on this Mac.
    case notPaired = "not_paired"
    /// The bundled Node runner is not where the app expects it.
    case runnerMissing = "runner_missing"
    /// The runner process stopped three times in five minutes.
    case keepsStopping = "keeps_stopping"
    /// The saved pairing points at a deployment this build refuses.
    case wrongDeployment = "wrong_deployment"

    /// True when only a person can fix it. Only these send a notification.
    /// The runner retries an unreachable Portal and a stopped process on its own.
    public var needsPerson: Bool {
        switch self {
        case .unreachable, .keepsStopping: return false
        default: return true
        }
    }
}

public enum RunKind: String, Codable, Sendable {
    case task, planning, build
}

/// The piece of work a `working` or `finished` line is about.
public struct WorkInfo: Equatable, Sendable {
    public var kind: RunKind
    public var milestoneId: String?
    public var milestone: String
    public var taskOrder: Int?
    public var task: String?

    public init(kind: RunKind, milestoneId: String? = nil, milestone: String, taskOrder: Int? = nil, task: String? = nil) {
        self.kind = kind
        self.milestoneId = milestoneId
        self.milestone = milestone
        self.taskOrder = taskOrder
        self.task = task
    }
}

/// One state line from the runner started with `--supervised`.
public enum RunnerEvent: Equatable, Sendable {
    case started(runnerId: String, production: Bool, paused: Bool)
    case idle
    case working(WorkInfo)
    /// `status` is done, blocked or failed.
    case finished(WorkInfo, status: String)
    case paused
    case attention(AttentionReason)

    /// Must match `SUPERVISOR_PREFIX` in tools/runner/src/lib.mjs.
    public static let prefix = "@@warehaus "

    /// The event on one stdout line, or nil for the runner's ordinary log lines
    /// and for anything this build does not understand.
    public static func parse(line: String) -> RunnerEvent? {
        guard line.hasPrefix(prefix) else { return nil }
        let json = Data(line.dropFirst(prefix.count).utf8)
        guard let raw = try? JSONDecoder().decode(Raw.self, from: json) else { return nil }
        switch raw.type {
        case "started":
            guard let runnerId = raw.runnerId, !runnerId.isEmpty else { return nil }
            return .started(runnerId: runnerId, production: raw.production ?? false, paused: raw.paused ?? false)
        case "idle":
            return .idle
        case "paused":
            return .paused
        case "working":
            return raw.work.map(RunnerEvent.working)
        case "finished":
            guard let work = raw.work, let status = raw.status else { return nil }
            return .finished(work, status: status)
        case "attention":
            guard let value = raw.reason, let reason = AttentionReason(rawValue: value) else { return nil }
            return .attention(reason)
        default:
            return nil
        }
    }

    private struct Raw: Decodable {
        var type: String
        var runnerId: String?
        var production: Bool?
        var paused: Bool?
        var kind: String?
        var milestoneId: String?
        var milestone: String?
        var taskOrder: Int?
        var task: String?
        var status: String?
        var reason: String?

        var work: WorkInfo? {
            guard let value = kind, let kind = RunKind(rawValue: value) else { return nil }
            return WorkInfo(kind: kind, milestoneId: milestoneId, milestone: milestone ?? "", taskOrder: taskOrder, task: task)
        }
    }
}
