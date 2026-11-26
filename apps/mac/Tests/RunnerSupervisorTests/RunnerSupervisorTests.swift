import XCTest
@testable import RunnerSupervisor

/// The supervisor against a fake runner process.
@MainActor
final class RunnerSupervisorTests: XCTestCase {
    var processes: FakeProcesses!
    var pauseStore: MemoryPauseStore!
    var scheduled: [(TimeInterval, @MainActor () -> Void)] = []
    var clock = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() {
        processes = FakeProcesses()
        pauseStore = MemoryPauseStore()
        scheduled = []
    }

    private func supervisor(
        policy: DeploymentPolicy = DeploymentPolicy(flavor: .release),
        pairing: Pairing? = productionPairing,
        locator: FixedLocator = .found
    ) -> RunnerSupervisor {
        RunnerSupervisor(
            policy: policy,
            pairing: FixedPairing(pairing: pairing),
            locator: locator,
            processes: processes,
            pauseStore: pauseStore,
            now: { [unowned self] in self.clock },
            schedule: { [unowned self] delay, work in self.scheduled.append((delay, work)) }
        )
    }

    func testStartsTheRunnerHeadlessOnProductionAndFollowsItsState() throws {
        let runner = supervisor()
        runner.start()
        XCTAssertEqual(processes.made.first?.arguments, ["start", "--supervised", "--mode", "headless", "--production"])
        let child = try XCTUnwrap(processes.last)
        XCTAssertTrue(child.started)
        XCTAssertEqual(runner.snapshot.activity, .starting)

        child.emit(#"{"type":"started","runnerId":"peter-mbp-prod","production":true,"paused":false}"#)
        child.onLine?("[runner] Nothing to do. Waiting.")
        child.emit(#"{"type":"idle"}"#)
        XCTAssertEqual(runner.menu.status, .ready)

        child.emit(#"{"type":"working","kind":"task","milestoneId":"m1","milestone":"Launch","taskOrder":2}"#)
        XCTAssertEqual(runner.menu.status, .working)
        XCTAssertEqual(runner.menu.lines.first, "Launch · task 2")

        child.emit(#"{"type":"finished","kind":"task","milestoneId":"m1","milestone":"Launch","taskOrder":2,"status":"done"}"#)
        child.emit(#"{"type":"idle"}"#)
        XCTAssertEqual(runner.menu.lines.last, "Last run: Launch · just now")
    }

    func testPauseAndResumeGoToTheRunnerAndAreRemembered() throws {
        let runner = supervisor()
        runner.start()
        let child = try XCTUnwrap(processes.last)
        child.emit(#"{"type":"idle"}"#)

        runner.pause()
        XCTAssertEqual(child.sent, ["pause"])
        XCTAssertTrue(pauseStore.paused)
        XCTAssertEqual(runner.menu.status, .paused)

        runner.resume()
        XCTAssertEqual(child.sent, ["pause", "resume"])
        XCTAssertFalse(pauseStore.paused)
        XCTAssertEqual(runner.menu.status, .ready)
    }

    func testPauseDuringARunKeepsWorkingUntilTheRunnerSaysPaused() throws {
        let runner = supervisor()
        runner.start()
        let child = try XCTUnwrap(processes.last)
        child.emit(#"{"type":"working","kind":"task","milestone":"Launch","taskOrder":1}"#)
        runner.pause()
        XCTAssertEqual(runner.menu.status, .working)
        XCTAssertEqual(runner.menu.primary.first?.action, .cancelPauseAfterRun)
        child.emit(#"{"type":"finished","kind":"task","milestone":"Launch","taskOrder":1,"status":"done"}"#)
        child.emit(#"{"type":"paused"}"#)
        XCTAssertEqual(runner.menu.status, .paused)
    }

    func testStartsPausedAfterARestartWhenThePersonPaused() {
        pauseStore.paused = true
        supervisor().start()
        XCTAssertEqual(processes.made.first?.arguments.last, "--paused")
    }

    func testNeedsAttentionBeforeStartingWhenItCannotRun() {
        let unpaired = supervisor(pairing: nil)
        unpaired.start()
        XCTAssertEqual(unpaired.snapshot.attention, .notPaired)

        let dev = supervisor(pairing: devPairing)
        dev.start()
        XCTAssertEqual(dev.snapshot.attention, .wrongDeployment, "a release build never runs against dev")

        let debugOnProduction = supervisor(policy: DeploymentPolicy(flavor: .debug), pairing: productionPairing)
        debugOnProduction.start()
        XCTAssertEqual(debugOnProduction.snapshot.attention, .wrongDeployment, "a debug build refuses unique-turtle-383")

        let missing = supervisor(locator: FixedLocator(installation: nil))
        missing.start()
        XCTAssertEqual(missing.snapshot.attention, .runnerMissing)

        XCTAssertTrue(processes.made.isEmpty)
    }

    func testRestartsAStoppedRunnerAndRaisesAttentionWhenItKeepsStopping() throws {
        let runner = supervisor()
        runner.start()
        for attempt in 0..<3 {
            try XCTUnwrap(processes.last).exit(1)
            XCTAssertEqual(runner.snapshot.activity, .stopped)
            XCTAssertEqual(scheduled.last?.0, RunnerSupervisor.restartDelays[attempt])
            clock.addTimeInterval(10)
            scheduled.last?.1()
        }
        XCTAssertEqual(processes.made.count, 4)
        XCTAssertEqual(runner.snapshot.attention, .keepsStopping)
        XCTAssertEqual(runner.menu.primary.first, MenuItem("Restart runner", .restartRunner))
    }

    func testANotPairedRunnerIsNotRestarted() throws {
        let runner = supervisor()
        runner.start()
        let child = try XCTUnwrap(processes.last)
        child.emit(#"{"type":"attention","reason":"not_paired"}"#)
        child.exit(2)
        XCTAssertTrue(scheduled.isEmpty)
        XCTAssertEqual(runner.menu.status, .needsAttention)
    }

    func testStopTerminatesWithoutRestarting() throws {
        let runner = supervisor()
        runner.start()
        let child = try XCTUnwrap(processes.last)
        runner.stop()
        XCTAssertTrue(child.terminated)
        child.exit(15)
        XCTAssertTrue(scheduled.isEmpty)
    }

    func testRemoveStopsTheRunnerAndRunsRemove() async throws {
        let runner = supervisor()
        runner.start()
        let child = try XCTUnwrap(processes.last)
        pauseStore.paused = true

        let outcome = await runner.remove()
        XCTAssertEqual(outcome, .removed)
        XCTAssertTrue(child.terminated)
        XCTAssertEqual(processes.ran, [["remove", "--production"]])
        XCTAssertEqual(runner.snapshot.attention, .notPaired)
        XCTAssertFalse(pauseStore.paused)
    }

    func testRemoveOutcomesFollowTheRunnerExitCode() async {
        for (code, expected) in [(Int32(0), RemoveOutcome.removed), (3, .removedNotRevoked), (4, .keychainFailed), (1, .failed)] {
            processes.removeExitCode = code
            let outcome = await supervisor().remove()
            XCTAssertEqual(outcome, expected, "exit \(code)")
        }
    }
}
