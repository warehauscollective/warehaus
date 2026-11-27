import Foundation
import XCTest
@testable import RunnerSupervisor

final class AppUpdateRuleTests: XCTestCase {
    let release = AppRelease(version: "0.1.1", build: 312, sha256: String(repeating: "a", count: 64), size: 1000,
                             url: URL(string: "https://unique-turtle-383.convex.cloud/api/storage/x")!)

    func testOutOfDateMeansAHigherBuild() {
        XCTAssertTrue(AppUpdateRule.needsUpdate(installed: 309, latest: release))
        XCTAssertFalse(AppUpdateRule.needsUpdate(installed: 312, latest: release))
        XCTAssertFalse(AppUpdateRule.needsUpdate(installed: 400, latest: release))
        XCTAssertFalse(AppUpdateRule.needsUpdate(installed: 309, latest: nil))
        XCTAssertTrue(AppUpdateRule.needsUpdate(installed: nil, latest: release))
    }

    func testMinimumMacOS() {
        XCTAssertTrue(AppUpdateRule.runs(on: OperatingSystemVersion(majorVersion: 14, minorVersion: 0, patchVersion: 0), minMacOS: "14.0"))
        XCTAssertTrue(AppUpdateRule.runs(on: OperatingSystemVersion(majorVersion: 27, minorVersion: 3, patchVersion: 0), minMacOS: "14.0"))
        XCTAssertFalse(AppUpdateRule.runs(on: OperatingSystemVersion(majorVersion: 14, minorVersion: 2, patchVersion: 0), minMacOS: "15.0"))
    }

    func testParsesTheRunnerLine() throws {
        let line = #"@@warehaus {"type":"app_release","release":{"version":"0.1.1","build":312,"sha256":"\#(String(repeating: "a", count: 64))","size":1000,"minMacOS":"14.0","publishedAt":5,"url":"https://unique-turtle-383.convex.cloud/api/storage/x"},"at":1}"#
        XCTAssertEqual(AppRelease.parse(line: line), .some(release))
        XCTAssertEqual(AppRelease.parse(line: #"@@warehaus {"type":"app_release","release":null,"at":1}"#), .some(nil))
        XCTAssertNil(AppRelease.parse(line: "[runner] hello"))
        XCTAssertNil(AppRelease.parse(line: #"@@warehaus {"type":"idle","at":1}"#))
    }
}

final class UpdateVerifierTests: XCTestCase {
    let release = AppRelease(version: "0.1.1", build: 312, sha256: String(repeating: "b", count: 64), size: 2000, url: URL(string: "https://x.convex.cloud/f")!)
    let current = AppBuild(version: "0.1.0", build: 309)

    var good: DownloadFacts {
        DownloadFacts(size: 2000, sha256: String(repeating: "B", count: 64), signatureValid: true, teamIdentifier: "7XQWUC33C7",
                      bundleIdentifier: "co.warehaus.runner.app", build: 312, gatekeeperAccepted: true)
    }

    func testAGoodDownloadPasses() {
        XCTAssertNil(UpdateVerifier.verdict(good, release: release, current: current))
    }

    func testShaOrSizeMismatchIsRefused() {
        var facts = good
        facts.sha256 = String(repeating: "c", count: 64)
        XCTAssertEqual(UpdateVerifier.verdict(facts, release: release, current: current), .checksumMismatch)
        facts = good
        facts.size = 1999
        XCTAssertEqual(UpdateVerifier.verdict(facts, release: release, current: current), .sizeMismatch)
        XCTAssertEqual(UpdateVerifier.zipVerdict(size: 2000, sha256: "00", release: release), .checksumMismatch)
    }

    func testAWrongTeamOrAppIsRefused() {
        var facts = good
        facts.teamIdentifier = "ABCDE12345"
        XCTAssertEqual(UpdateVerifier.verdict(facts, release: release, current: current), .wrongTeam)
        facts.teamIdentifier = nil
        XCTAssertEqual(UpdateVerifier.verdict(facts, release: release, current: current), .wrongTeam)
        facts = good
        facts.bundleIdentifier = "com.example.other"
        XCTAssertEqual(UpdateVerifier.verdict(facts, release: release, current: current), .wrongApp)
        facts = good
        facts.signatureValid = false
        XCTAssertEqual(UpdateVerifier.verdict(facts, release: release, current: current), .badSignature)
    }

    func testALowerOrEqualBuildIsRefused() {
        let same = AppBuild(version: "0.1.1", build: 312)
        XCTAssertEqual(UpdateVerifier.verdict(good, release: release, current: same), .notNewer)
        XCTAssertEqual(UpdateVerifier.verdict(good, release: release, current: AppBuild(version: "0.2.0", build: 400)), .notNewer)
        var facts = good
        facts.build = 311
        XCTAssertEqual(UpdateVerifier.verdict(facts, release: release, current: current), .wrongBuild)
    }

    func testNotNotarizedIsRefused() {
        var facts = good
        facts.gatekeeperAccepted = false
        XCTAssertEqual(UpdateVerifier.verdict(facts, release: release, current: current), .notNotarized)
    }
}

final class InstallGateTests: XCTestCase {
    func testNeverDuringARun() {
        let work = WorkInfo(kind: .task, milestone: "Launch", taskOrder: 3)
        XCTAssertFalse(InstallGate.safeToInstall(RunnerSnapshot(activity: .working(work))))
        XCTAssertFalse(InstallGate.safeToInstall(RunnerSnapshot(activity: .starting)))
        XCTAssertTrue(InstallGate.safeToInstall(RunnerSnapshot(activity: .idle)))
        XCTAssertTrue(InstallGate.safeToInstall(RunnerSnapshot(activity: .paused)))
        XCTAssertTrue(InstallGate.safeToInstall(RunnerSnapshot(activity: .stopped)))
    }
}

final class UpdateLineTests: XCTestCase {
    let current = AppBuild(version: "0.1.0", build: 309)

    func testWording() {
        XCTAssertEqual(UpdateLine.from(.upToDate, current: current, working: false), UpdateLine(title: "Up to date", trailing: "v0.1.0", offersCheck: true))
        XCTAssertEqual(UpdateLine.from(.upToDate, current: current, working: true).offersCheck, false)
        XCTAssertEqual(UpdateLine.from(.checking, current: current, working: false).title, "Checking for update…")
        XCTAssertEqual(UpdateLine.from(.downloading(version: "0.1.1"), current: current, working: false),
                       UpdateLine(title: "Downloading update…", trailing: "v0.1.1", offersCheck: false))
        XCTAssertEqual(UpdateLine.from(.ready(version: "0.1.1"), current: current, working: true).title, "Update waits for this run")
        XCTAssertEqual(UpdateLine.from(.ready(version: "0.1.1"), current: current, working: false).title, "Installs before the next run")
        XCTAssertEqual(UpdateLine.from(.installing(version: "0.1.1"), current: current, working: false).title, "Installing update…")
        let failed = UpdateLine.from(.failed(reason: UpdateRejection.checksumMismatch.reason), current: current, working: false)
        XCTAssertEqual(failed.title, "Update failed: the download didn't match")
        XCTAssertTrue(failed.offersCheck)
        XCTAssertEqual(UpdateLine.from(.notWritable, current: current, working: false).title, "Can't update here. Move the app to Applications.")
    }

    func testSwapOutcome() {
        XCTAssertEqual(SwapOutcome.decide(checkedIn: true, newAppRunning: true, waited: 1), .keepNew)
        XCTAssertEqual(SwapOutcome.decide(checkedIn: false, newAppRunning: true, waited: 1), .keepWaiting)
        XCTAssertEqual(SwapOutcome.decide(checkedIn: false, newAppRunning: false, waited: 4), .rollBack)
        XCTAssertEqual(SwapOutcome.decide(checkedIn: false, newAppRunning: true, waited: SwapOutcome.checkInTimeout), .rollBack)
    }
}
