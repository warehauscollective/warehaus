import XCTest
@testable import RunnerSupervisor

/// Heartbeat to menu state: the four approved states and their rows.
final class MenuStateTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func snapshot(_ events: [RunnerEvent]) -> RunnerSnapshot {
        var snapshot = RunnerSnapshot()
        for event in events { snapshot.apply(event, at: now.addingTimeInterval(-12 * 60)) }
        return snapshot
    }

    private let started = RunnerEvent.started(runnerId: "peter-mbp-prod", production: true, paused: false)
    private let work = WorkInfo(kind: .task, milestoneId: "m1", milestone: "Client experience launch", taskOrder: 3)

    func testReady() {
        let menu = MenuState.from(snapshot([started, .working(work), .finished(WorkInfo(kind: .task, milestone: "Client portal approvals"), status: "done"), .idle]), pauseRequested: false, now: now)
        XCTAssertEqual(menu.status, .ready)
        XCTAssertEqual(menu.lines, ["peter-mbp-prod · Production", "Last run: Client portal approvals · 12m ago"])
        XCTAssertEqual(menu.primary, [MenuItem("Pause runner", .pause), MenuItem("Open Portal", .openPortal)])
        XCTAssertTrue(menu.showsUpdateLine)
        XCTAssertFalse(menu.updateWaitsForRun)
        XCTAssertNil(menu.secondaryPause)
    }

    func testWorking() {
        let menu = MenuState.from(snapshot([started, .working(work)]), pauseRequested: false, now: now)
        XCTAssertEqual(menu.status, .working)
        XCTAssertEqual(menu.lines, ["Client experience launch · task 3", "Keeping this Mac awake until the run ends"])
        XCTAssertEqual(menu.primary, [MenuItem("Pause after this run", .pauseAfterRun), MenuItem("Open milestone in Portal", .openMilestone("m1"))])
        XCTAssertTrue(menu.updateWaitsForRun)
    }

    func testPauseDuringARunWaitsForTheRunToEnd() {
        let working = MenuState.from(snapshot([started, .working(work)]), pauseRequested: true, now: now)
        XCTAssertEqual(working.status, .working)
        XCTAssertEqual(working.lines.last, "Pauses when this run ends")
        XCTAssertEqual(working.primary.first, MenuItem("Keep working after this run", .cancelPauseAfterRun))

        // The run ends; the runner has not said paused yet, but the person asked.
        let ended = MenuState.from(snapshot([started, .working(work), .finished(work, status: "done")]), pauseRequested: true, now: now)
        XCTAssertEqual(ended.status, .paused)
    }

    func testSeveralRunsAtOnce() {
        let a = WorkInfo(runId: "r1", kind: .task, milestoneId: "m1", milestone: "Client experience launch", taskOrder: 3)
        let b = WorkInfo(runId: "r2", kind: .planning, milestoneId: "m2", milestone: "Double booking")
        let c = WorkInfo(runId: "r3", kind: .build, milestoneId: "m3", milestone: "Figma cleanup")
        let d = WorkInfo(runId: "r4", kind: .task, milestoneId: "m4", milestone: "Status picker", taskOrder: 1)
        var state = snapshot([started, .working(a), .working(b)])
        XCTAssertEqual(state.runs.map(\.runId), ["r1", "r2"])
        var menu = MenuState.from(state, pauseRequested: false, now: now)
        XCTAssertEqual(menu.status, .working)
        XCTAssertEqual(menu.lines, ["2 runs in progress", "Client experience launch · task 3", "Double booking · planning", "Keeping this Mac awake until the runs end"])
        XCTAssertEqual(menu.primary, [MenuItem("Pause after these runs", .pauseAfterRun), MenuItem("Open Portal", .openPortal)])
        XCTAssertTrue(menu.updateWaitsForRun)
        menu = MenuState.from(state, pauseRequested: true, now: now)
        XCTAssertEqual(menu.lines.last, "Pauses when these runs end")
        XCTAssertEqual(menu.primary.first, MenuItem("Keep working after these runs", .cancelPauseAfterRun))
        // Past three runs the rest are counted.
        state.apply(.working(c), at: now)
        state.apply(.working(d), at: now)
        XCTAssertEqual(MenuState.from(state, pauseRequested: false, now: now).lines, [
            "4 runs in progress", "Client experience launch · task 3", "Double booking · planning", "Figma cleanup · Cursor build", "and 1 more",
            "Keeping this Mac awake until the runs end",
        ])
        // One finishing leaves the others working; the last one finishing is Ready.
        for id in ["r1", "r3", "r4"] {
            state.apply(.finished(WorkInfo(runId: id, kind: .task, milestone: "x"), status: "done"), at: now)
        }
        XCTAssertEqual(state.activity, .working(b))
        XCTAssertEqual(MenuState.from(state, pauseRequested: false, now: now).lines, ["Double booking · planning", "Keeping this Mac awake until the run ends"])
        state.apply(.finished(b, status: "done"), at: now)
        XCTAssertEqual(state.activity, .idle)
        XCTAssertEqual(state.lastRun?.milestone, "Double booking")
    }

    func testACursorBuildThatIsStillGoingIsNotALastRun() {
        let build = WorkInfo(runId: "r9", kind: .build, milestoneId: "m9", milestone: "Figma cleanup")
        var state = snapshot([started, .working(build)])
        state.apply(.finished(build, status: "running"), at: now)
        XCTAssertNil(state.lastRun)
        XCTAssertTrue(state.runs.isEmpty)
        // Followed again under the same run id: one line, not two.
        state.apply(.working(build), at: now)
        state.apply(.working(build), at: now)
        XCTAssertEqual(state.runs.count, 1)
    }

    func testParsesTheRunIdOnWorkingLines() {
        let line = #"@@warehaus {"type":"working","runId":"r1","kind":"task","milestoneId":"m1","milestone":"Launch","taskOrder":2,"task":"Copy","running":2}"#
        XCTAssertEqual(RunnerEvent.parse(line: line), .working(WorkInfo(runId: "r1", kind: .task, milestoneId: "m1", milestone: "Launch", taskOrder: 2, task: "Copy")))
    }

    func testPaused() {
        let menu = MenuState.from(snapshot([started, .paused]), pauseRequested: true, now: now)
        XCTAssertEqual(menu.status, .paused)
        XCTAssertEqual(menu.lines, ["Takes no new work. The Portal shows Paused."])
        XCTAssertEqual(menu.primary, [MenuItem("Resume runner", .resume), MenuItem("Open Portal", .openPortal)])
        XCTAssertTrue(menu.showsUpdateLine)
    }

    func testStartedPausedIsPaused() {
        let menu = MenuState.from(snapshot([.started(runnerId: "peter-mbp-prod", production: true, paused: true)]), pauseRequested: true, now: now)
        XCTAssertEqual(menu.status, .paused)
    }

    func testNeedsAttention() {
        let menu = MenuState.from(snapshot([started, .idle, .attention(.github)]), pauseRequested: false, now: now)
        XCTAssertEqual(menu.status, .needsAttention)
        XCTAssertEqual(menu.lines, ["GitHub sign-in expired. Builds wait until you sign in again."])
        XCTAssertEqual(menu.primary, [MenuItem("Sign in to GitHub…", .signInToGitHub), MenuItem("Open Portal", .openPortal)])
        XCTAssertEqual(menu.secondaryPause, MenuItem("Pause runner", .pause))
        XCTAssertFalse(menu.showsUpdateLine)
    }

    func testAttentionClearsWhenTheRunnerWorksAgain() {
        XCTAssertEqual(MenuState.from(snapshot([started, .attention(.unreachable), .idle]), pauseRequested: false, now: now).status, .ready)
        XCTAssertEqual(MenuState.from(snapshot([started, .attention(.github), .working(work)]), pauseRequested: false, now: now).status, .working)
        XCTAssertEqual(MenuState.from(snapshot([started, .attention(.github), .paused]), pauseRequested: true, now: now).status, .paused)
    }

    func testEveryReasonHasCopyAndOnlyFixableOnesHaveAFix() {
        for reason in AttentionReason.allCases {
            XCTAssertFalse(MenuState.message(for: reason).isEmpty)
            let menu = MenuState.from(RunnerSnapshot(attention: reason), pauseRequested: true, now: now)
            XCTAssertEqual(menu.primary.last, MenuItem("Open Portal", .openPortal))
            XCTAssertEqual(menu.secondaryPause, MenuItem("Resume runner", .resume))
        }
        XCTAssertEqual(MenuState.fix(for: .outOfDate), MenuItem("Check for update", .checkForUpdate))
        XCTAssertEqual(MenuState.fix(for: .unauthorized), MenuItem("Pair with the Portal…", .pairAgain))
        XCTAssertNil(MenuState.fix(for: .unreachable))
    }

    func testOnlyReasonsAPersonCanFixNotify() {
        XCTAssertTrue(AttentionReason.github.needsPerson)
        XCTAssertTrue(AttentionReason.unauthorized.needsPerson)
        XCTAssertFalse(AttentionReason.unreachable.needsPerson)
        XCTAssertFalse(AttentionReason.keepsStopping.needsPerson)
    }

    func testWorkLines() {
        XCTAssertEqual(MenuState.workLine(WorkInfo(kind: .planning, milestone: "Launch")), "Launch · planning")
        XCTAssertEqual(MenuState.workLine(WorkInfo(kind: .build, milestone: "Launch")), "Launch · Cursor build")
        XCTAssertEqual(MenuState.workLine(WorkInfo(kind: .task, milestone: "Launch")), "Launch")
        // Without a milestone id there is no milestone link: Open Portal instead.
        let menu = MenuState.from(snapshot([started, .working(WorkInfo(kind: .build, milestone: "Launch"))]), pauseRequested: false, now: now)
        XCTAssertEqual(menu.primary.last, MenuItem("Open Portal", .openPortal))
    }

    func testAgo() {
        XCTAssertEqual(MenuState.ago(now.addingTimeInterval(-20), now: now), "just now")
        XCTAssertEqual(MenuState.ago(now.addingTimeInterval(-12 * 60), now: now), "12m ago")
        XCTAssertEqual(MenuState.ago(now.addingTimeInterval(-3 * 3600), now: now), "3h ago")
        XCTAssertEqual(MenuState.ago(now.addingTimeInterval(-50 * 3600), now: now), "2d ago")
        XCTAssertEqual(MenuState.ago(now.addingTimeInterval(60), now: now), "just now")
    }
}
