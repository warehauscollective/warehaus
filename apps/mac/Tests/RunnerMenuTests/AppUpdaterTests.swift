import Foundation
import XCTest
@testable import RunnerMenu
@testable import RunnerSupervisor

private struct FakeSource: ReleaseSource {
    var release: AppRelease?
    func latest() async throws -> AppRelease? { release }
}

@MainActor
private final class FakeWorkspace: UpdateWorkspace {
    var facts: DownloadFacts
    var measured: (Int, String)
    var discarded = 0
    var unzipped = 0

    init(facts: DownloadFacts, measured: (Int, String)) {
        self.facts = facts
        self.measured = measured
    }

    func download(_ release: AppRelease) async throws -> URL { URL(fileURLWithPath: "/tmp/fake/Warehaus-Runner.zip") }
    func measure(_ zip: URL) throws -> (size: Int, sha256: String) { measured }
    func unzip(_ zip: URL) async throws -> URL {
        unzipped += 1
        return URL(fileURLWithPath: "/tmp/fake/Warehaus Runner.app")
    }
    func inspect(_ app: URL) async -> DownloadFacts { facts }
    func discard() { discarded += 1 }
}

@MainActor
private final class FakeSwapper: AppSwapping {
    var writable = true
    var swapped = 0
    var launched = 0
    var checksIn = true
    var newAppRuns = true
    var rolledBack = 0
    var finished = 0
    let checkInFlag = URL(fileURLWithPath: "/tmp/fake/checked-in")

    func canReplace() -> Bool { writable }
    func swap(in newApp: URL) throws { swapped += 1 }
    func launchReplacement(checkIn: URL) async throws -> pid_t {
        launched += 1
        return 4242
    }
    func isRunning(_ pid: pid_t) -> Bool { newAppRuns }
    func checkedIn(_ flag: URL) -> Bool { checksIn }
    func rollBack(stopping pid: pid_t) throws { rolledBack += 1 }
    func finish() { finished += 1 }
}

@MainActor
final class AppUpdaterTests: XCTestCase {
    let sha = String(repeating: "d", count: 64)
    lazy var release = AppRelease(version: "0.1.1", build: 312, sha256: sha, size: 5000, url: URL(string: "https://x.convex.cloud/f")!)
    lazy var goodFacts = DownloadFacts(size: 0, sha256: "", signatureValid: true, teamIdentifier: "7XQWUC33C7",
                                       bundleIdentifier: "co.warehaus.runner.app", build: 312, gatekeeperAccepted: true)
    var stops = 0
    var starts = 0

    private func updater(_ workspace: FakeWorkspace, _ swapper: FakeSwapper, release: AppRelease?) -> AppUpdater {
        AppUpdater(
            current: AppBuild(version: "0.1.0", build: 309),
            source: FakeSource(release: release),
            workspace: workspace,
            swapper: swapper,
            stopRunner: { [unowned self] in self.stops += 1 },
            startRunner: { [unowned self] in self.starts += 1 },
            system: OperatingSystemVersion(majorVersion: 15, minorVersion: 0, patchVersion: 0),
            sleep: { _ in await Task.yield() }
        )
    }

    private func settle() async {
        for _ in 0..<50 { await Task.yield() }
    }

    func testUpToDateDoesNothing() async {
        let workspace = FakeWorkspace(facts: goodFacts, measured: (5000, sha))
        let subject = updater(workspace, FakeSwapper(), release: AppRelease(version: "0.1.0", build: 309, sha256: sha, size: 1, url: release.url))
        await subject.check()
        XCTAssertEqual(subject.phase, .upToDate)
        XCTAssertEqual(workspace.unzipped, 0)
    }

    func testNeverInstallsDuringWorkingThenInstallsOnceIdle() async {
        let workspace = FakeWorkspace(facts: goodFacts, measured: (5000, sha))
        let swapper = FakeSwapper()
        let subject = updater(workspace, swapper, release: release)
        subject.runnerChanged(RunnerSnapshot(activity: .working(WorkInfo(kind: .task, milestone: "Launch", taskOrder: 2))))
        await settle()
        await subject.check()
        XCTAssertEqual(subject.phase, .ready(version: "0.1.1"))
        XCTAssertEqual(swapper.swapped, 0)
        XCTAssertEqual(stops, 0)
        XCTAssertEqual(subject.line(working: true).title, "Update waits for this run")

        subject.runnerChanged(RunnerSnapshot(activity: .working(WorkInfo(kind: .task, milestone: "Launch", taskOrder: 3))))
        await settle()
        XCTAssertEqual(swapper.swapped, 0)

        subject.runnerChanged(RunnerSnapshot(activity: .idle))
        await settle()
        XCTAssertEqual(stops, 1)
        XCTAssertEqual(swapper.swapped, 1)
        XCTAssertEqual(swapper.launched, 1)
        XCTAssertEqual(swapper.finished, 1)
        XCTAssertEqual(swapper.rolledBack, 0)
        XCTAssertEqual(workspace.discarded, 1, "the download folder goes once the new app is up")
    }

    func testRollsBackWhenTheNewAppFailsToStart() async {
        let workspace = FakeWorkspace(facts: goodFacts, measured: (5000, sha))
        let swapper = FakeSwapper()
        swapper.checksIn = false
        swapper.newAppRuns = false
        let subject = updater(workspace, swapper, release: release)
        subject.runnerChanged(RunnerSnapshot(activity: .idle))
        await settle()
        await subject.check()
        await settle()
        XCTAssertEqual(swapper.swapped, 1)
        XCTAssertEqual(swapper.rolledBack, 1)
        XCTAssertEqual(swapper.finished, 0)
        XCTAssertEqual(starts, 1, "the runner starts again on the old app")
        XCTAssertEqual(subject.phase, .failed(reason: "the new version didn't start"))
    }

    func testAShaMismatchIsDiscardedBeforeUnzipping() async {
        let workspace = FakeWorkspace(facts: goodFacts, measured: (5000, String(repeating: "e", count: 64)))
        let swapper = FakeSwapper()
        let subject = updater(workspace, swapper, release: release)
        subject.runnerChanged(RunnerSnapshot(activity: .idle))
        await subject.check()
        await settle()
        XCTAssertEqual(subject.phase, .failed(reason: "the download didn't match"))
        XCTAssertEqual(workspace.unzipped, 0)
        XCTAssertEqual(workspace.discarded, 1)
        XCTAssertEqual(swapper.swapped, 0)
    }

    func testAWrongTeamIsNeverInstalled() async {
        var facts = goodFacts
        facts.teamIdentifier = "ZZZZZZZZZZ"
        let workspace = FakeWorkspace(facts: facts, measured: (5000, sha))
        let swapper = FakeSwapper()
        let subject = updater(workspace, swapper, release: release)
        subject.runnerChanged(RunnerSnapshot(activity: .idle))
        await subject.check()
        await settle()
        XCTAssertEqual(subject.phase, .failed(reason: "it isn't signed by Warehaus"))
        XCTAssertEqual(workspace.discarded, 1)
        XCTAssertEqual(swapper.swapped, 0)
    }

    func testAnUnwritableAppStopsBeforeDownloading() async {
        let workspace = FakeWorkspace(facts: goodFacts, measured: (5000, sha))
        let swapper = FakeSwapper()
        swapper.writable = false
        let subject = updater(workspace, swapper, release: release)
        await subject.check()
        XCTAssertEqual(subject.phase, .notWritable)
        XCTAssertEqual(workspace.unzipped, 0)
    }
}
