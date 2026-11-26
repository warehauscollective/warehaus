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
