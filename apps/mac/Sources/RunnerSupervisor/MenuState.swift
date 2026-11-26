import Foundation

/// What a menu row does. The menu module turns these into calls.
public enum MenuAction: Equatable, Sendable {
    case pause
    case pauseAfterRun
    case cancelPauseAfterRun
    case resume
    case openPortal
    case openMilestone(String)
    case signInToGitHub
    case pairAgain
    case checkForUpdate
    case restartRunner
}

public struct MenuItem: Equatable, Sendable {
    public var title: String
    public var action: MenuAction

    public init(_ title: String, _ action: MenuAction) {
        self.title = title
        self.action = action
    }
}

/// The four states in the approved design (Figma, Mac runner app, node 1115-38617).
public enum MenuStatus: String, Sendable {
    case ready = "Ready"
    case working = "Working"
    case paused = "Paused"
    case needsAttention = "Needs attention"
}

/// The menu bar dropdown for one moment: the status, the header lines under
/// it, and the rows that change with the state. Start at login, Remove this
/// runner… and Quit are on every state, so the view adds them itself.
public struct MenuState: Equatable, Sendable {
    public var status: MenuStatus
    public var lines: [String]
    /// The first section: pause or resume (or the attention fix), then the Portal.
    public var primary: [MenuItem]
    /// Needs attention only: Pause or Resume moves down to where the update line was.
    public var secondaryPause: MenuItem?
    /// False on Needs attention, which has no update line in the design.
    public var showsUpdateLine: Bool
    /// Working: "Update waits for this run", greyed out.
    public var updateWaitsForRun: Bool

    public init(
        status: MenuStatus,
        lines: [String],
        primary: [MenuItem],
        secondaryPause: MenuItem? = nil,
        showsUpdateLine: Bool = true,
        updateWaitsForRun: Bool = false
    ) {
        self.status = status
        self.lines = lines
        self.primary = primary
        self.secondaryPause = secondaryPause
        self.showsUpdateLine = showsUpdateLine
        self.updateWaitsForRun = updateWaitsForRun
    }

    /// Maps the runner's state to the menu. `pauseRequested` is the person's
    /// choice, which the runner applies after any run in progress.
    public static func from(_ snapshot: RunnerSnapshot, pauseRequested: Bool, now: Date) -> MenuState {
        if let reason = snapshot.attention {
            let pause = pauseRequested ? MenuItem("Resume runner", .resume) : MenuItem("Pause runner", .pause)
            var primary: [MenuItem] = []
            if let fix = fix(for: reason) { primary.append(fix) }
            primary.append(MenuItem("Open Portal", .openPortal))
            return MenuState(
                status: .needsAttention,
                lines: [message(for: reason)],
                primary: primary,
                secondaryPause: pause,
                showsUpdateLine: false
            )
        }
        switch snapshot.activity {
        case let .working(work):
            let runs = snapshot.runs.isEmpty ? [work] : snapshot.runs
            if runs.count > 1 {
                // Several milestones at once: one line each, and Pause waits for all of them.
                let pause = pauseRequested
                    ? MenuItem("Keep working after these runs", .cancelPauseAfterRun)
                    : MenuItem("Pause after these runs", .pauseAfterRun)
                return MenuState(
                    status: .working,
                    lines: runLines(runs) + [pauseRequested ? "Pauses when these runs end" : "Keeping this Mac awake until the runs end"],
                    primary: [pause, MenuItem("Open Portal", .openPortal)],
                    updateWaitsForRun: true
                )
            }
            let portal = work.milestoneId.map { MenuItem("Open milestone in Portal", .openMilestone($0)) }
                ?? MenuItem("Open Portal", .openPortal)
            let pause = pauseRequested
                ? MenuItem("Keep working after this run", .cancelPauseAfterRun)
                : MenuItem("Pause after this run", .pauseAfterRun)
            return MenuState(
                status: .working,
                lines: [workLine(work), pauseRequested ? "Pauses when this run ends" : "Keeping this Mac awake until the run ends"],
                primary: [pause, portal],
                updateWaitsForRun: true
            )
        case .paused:
            return MenuState(
                status: .paused,
                lines: ["Takes no new work. The Portal shows Paused."],
                primary: [MenuItem("Resume runner", .resume), MenuItem("Open Portal", .openPortal)]
            )
        case .idle, .starting, .stopped:
            if pauseRequested {
                return from(RunnerSnapshot(runnerId: snapshot.runnerId, production: snapshot.production, activity: .paused), pauseRequested: true, now: now)
            }
            var lines = [identityLine(snapshot)]
            if snapshot.activity == .starting { lines.append("Starting…") }
            if let last = snapshot.lastRun { lines.append("Last run: \(last.milestone) · \(ago(last.endedAt, now: now))") }
            return MenuState(
                status: .ready,
                lines: lines,
                primary: [MenuItem("Pause runner", .pause), MenuItem("Open Portal", .openPortal)]
            )
        }
    }

    /// "peter-mbp-prod · Production".
    static func identityLine(_ snapshot: RunnerSnapshot) -> String {
        let deployment = snapshot.production ? "Production" : "Shared dev"
        guard let id = snapshot.runnerId else { return deployment }
        return "\(id) · \(deployment)"
    }

    /// "3 runs in progress", then one line per run (at most four: the runner's slots).
    static func runLines(_ runs: [WorkInfo]) -> [String] {
        ["\(runs.count) runs in progress"] + runs.map(workLine)
    }

    /// "Client experience launch · task 3". The claim carries the task's place, not the milestone's count.
    static func workLine(_ work: WorkInfo) -> String {
        switch work.kind {
        case .task:
            guard let order = work.taskOrder else { return work.milestone }
            return "\(work.milestone) · task \(order)"
        case .planning:
            return "\(work.milestone) · planning"
        case .build:
            return "\(work.milestone) · Cursor build"
        }
    }

    /// The header line for a reason. The GitHub one is the approved copy.
    public static func message(for reason: AttentionReason) -> String {
        switch reason {
        case .github: return "GitHub sign-in expired. Builds wait until you sign in again."
        case .unauthorized: return "This runner was revoked in the Portal. Pair this Mac again to keep running."
        case .outOfDate: return "This runner is out of date. It takes no work until it updates."
        case .unreachable: return "Can't reach the Portal. The runner keeps trying."
        case .notPaired: return "This Mac isn't paired with the Portal yet."
        case .runnerMissing: return "The runner files are missing. Download the app again from the Portal."
        case .keepsStopping: return "The runner keeps stopping. It restarts on its own."
        case .wrongDeployment: return "This Mac is paired to a deployment this build can't use."
        }
    }

    static func fix(for reason: AttentionReason) -> MenuItem? {
        switch reason {
        case .github: return MenuItem("Sign in to GitHub…", .signInToGitHub)
        case .unauthorized, .notPaired: return MenuItem("Pair with the Portal…", .pairAgain)
        case .outOfDate: return MenuItem("Check for update", .checkForUpdate)
        case .keepsStopping: return MenuItem("Restart runner", .restartRunner)
        case .unreachable, .runnerMissing, .wrongDeployment: return nil
        }
    }

    /// "just now", "12m ago", "3h ago", "2d ago".
    public static func ago(_ date: Date, now: Date) -> String {
        let minutes = max(0, Int(now.timeIntervalSince(date) / 60))
        if minutes < 1 { return "just now" }
        if minutes < 60 { return "\(minutes)m ago" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h ago" }
        return "\(hours / 24)d ago"
    }
}
