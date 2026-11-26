import Foundation
import XCTest
@testable import RunnerSupervisor

final class ChecklistStateTests: XCTestCase {
    let release = DeploymentPolicy(flavor: .release)
    let debug = DeploymentPolicy(flavor: .debug)
    let signedIn = GitHubFact.signedIn(login: "peterroquemore")

    func testTheDesignedFirstState() {
        let state = ChecklistState.from(SetupFacts(github: signedIn, claude: .missing), policy: release)
        XCTAssertEqual(state.rows.map(\.step), [.github, .claude, .pair])
        XCTAssertEqual(state.rows[0], ChecklistRow(step: .github, detail: "Signed in as peterroquemore", status: .done))
        XCTAssertEqual(state.rows[1].detail, "Not installed yet. Installs the official CLI and signs in.")
        XCTAssertEqual(state.rows[1].status, .button("Install", .installClaude, enabled: true))
        XCTAssertEqual(state.rows[2].detail, "After Claude Code. You confirm this Mac in the Portal.")
        XCTAssertEqual(state.rows[2].status, .button("Pair", .pair, enabled: false))
        XCTAssertEqual(state.footer, "Production only · starts at login · Apple silicon, macOS 14 or later")
        XCTAssertNil(state.notice)
        XCTAssertFalse(state.complete)
    }

    func testPairUnlocksOnlyWhenGitHubAndClaudeAreDone() {
        let claudeDone = ClaudeFact.signedIn(email: "a@b.co")
        XCTAssertEqual(ChecklistState.from(SetupFacts(github: .signedOut, claude: claudeDone), policy: release).rows[2].status,
                       .button("Pair", .pair, enabled: false))
        XCTAssertEqual(ChecklistState.from(SetupFacts(github: signedIn, claude: .signedOut), policy: release).rows[2].status,
                       .button("Pair", .pair, enabled: false))
        let open = ChecklistState.from(SetupFacts(github: signedIn, claude: claudeDone), policy: release)
        XCTAssertEqual(open.rows[2].status, .button("Pair", .pair, enabled: true))
        XCTAssertEqual(open.rows[1].detail, "Signed in as a@b.co")
    }

    func testEachStepHasAWorkingState() {
        let state = ChecklistState.from(SetupFacts(github: .signingIn(code: "1A2B-3C4D"), claude: .installing,
                                                   pair: .pairing(PairingCode(code: "K7QM-4XPA", runnerId: "x", expiresAt: Date()))), policy: release)
        XCTAssertEqual(state.rows.map(\.status), [.working, .working, .working])
        XCTAssertEqual(state.rows[0].detail, "Enter 1A2B-3C4D in your browser to finish.")
        XCTAssertEqual(ChecklistState.from(SetupFacts(), policy: release).rows[0].detail, "Checking…")
    }

    func testFailuresOfferTheNextClick() {
        let state = ChecklistState.from(SetupFacts(github: .failed("No"), claude: .failed("Nope"), pair: .expired), policy: release)
        XCTAssertEqual(state.rows[0].status, .problem("Try again", .signInToGitHub))
        XCTAssertEqual(state.rows[1].status, .problem("Try again", .retry(.claude)))
        XCTAssertEqual(state.rows[2].status, .problem("Pair again", .pair))
    }

    func testCompleteNeedsEveryStepAndNoOldAgent() {
        let done = SetupFacts(github: signedIn, claude: .signedIn(email: nil), pair: .paired(runnerId: "peter-mbp-prod"))
        XCTAssertTrue(ChecklistState.from(done, policy: release).complete)
        var withAgent = done
        withAgent.oldAgent = .present(label: "co.warehaus.runner.prod")
        let blocked = ChecklistState.from(withAgent, policy: release)
        XCTAssertFalse(blocked.complete)
        XCTAssertEqual(blocked.notice?.action, .replaceOldAgent)
        XCTAssertTrue(blocked.notice?.text.contains("co.warehaus.runner.prod") ?? false)
        withAgent.oldAgent = .replacing(label: "co.warehaus.runner.prod")
        XCTAssertEqual(ChecklistState.from(withAgent, policy: release).notice?.working, true)
        // A debug build leaves the agent alone and is not held up by it.
        withAgent.oldAgent = .leftAlone(label: "co.warehaus.runner")
        let debugState = ChecklistState.from(withAgent, policy: debug)
        XCTAssertTrue(debugState.complete)
        XCTAssertNil(debugState.notice?.action)
        XCTAssertEqual(debugState.footer, ChecklistState.debugFooter)
    }

    func testAnAdoptedPairingCountsAsPaired() {
        let state = ChecklistState.from(SetupFacts(github: signedIn, claude: .signedIn(email: nil), pair: .adopted(runnerId: "peter-mbp-prod")), policy: release)
        XCTAssertEqual(state.rows[2], ChecklistRow(step: .pair, detail: "Already paired as peter-mbp-prod. This app takes it over.", status: .done))
        XCTAssertTrue(state.complete)
    }

    func testCountdown() {
        let code = PairingCode(code: "K7QM-4XPA", runnerId: "x", expiresAt: Date(timeIntervalSince1970: 1000))
        XCTAssertEqual(code.remaining(now: Date(timeIntervalSince1970: 1000 - 581)), "9:41")
        XCTAssertEqual(code.remaining(now: Date(timeIntervalSince1970: 1000 - 5)), "0:05")
        XCTAssertEqual(code.remaining(now: Date(timeIntervalSince1970: 2000)), "0:00")
    }
}

final class TakeoverTests: XCTestCase {
    let release = DeploymentPolicy(flavor: .release)
    let debug = DeploymentPolicy(flavor: .debug)
    let production = Pairing(runnerId: "peter-mbp-prod", agentURL: "https://unique-turtle-383.convex.site")
    let dev = Pairing(runnerId: "peter-mbp", agentURL: "https://graceful-mastiff-960.convex.site")

    func testAdoptsAnExistingPairingWithItsSecret() {
        let plan = Takeover.decide(policy: release, pairing: production, hasSecret: true, agentInstalled: true)
        XCTAssertEqual(plan.adopt, production)
        XCTAssertEqual(plan.oldAgent, .present(label: "co.warehaus.runner.prod"))
    }

    func testPairsFreshWithoutAFileOrSecret() {
        XCTAssertEqual(Takeover.decide(policy: release, pairing: nil, hasSecret: false, agentInstalled: false), Takeover(adopt: nil, oldAgent: .none))
        // A file whose Keychain item is gone is not a pairing.
        XCTAssertNil(Takeover.decide(policy: release, pairing: production, hasSecret: false, agentInstalled: false).adopt)
    }

    func testNeverAdoptsAnotherDeployment() {
        XCTAssertNil(Takeover.decide(policy: release, pairing: dev, hasSecret: true, agentInstalled: false).adopt)
        XCTAssertNil(Takeover.decide(policy: debug, pairing: production, hasSecret: true, agentInstalled: false).adopt)
        XCTAssertEqual(Takeover.decide(policy: debug, pairing: dev, hasSecret: true, agentInstalled: false).adopt, dev)
    }

    func testDebugBuildsLeaveTheAgentAlone() {
        XCTAssertEqual(Takeover.decide(policy: debug, pairing: dev, hasSecret: true, agentInstalled: true).oldAgent,
                       .leftAlone(label: "co.warehaus.runner"))
    }

    func testNamesMatchTheTerminalRunner() {
        XCTAssertEqual(release.keychainAccount(runnerId: "peter-mbp-prod"), "unique-turtle-383:peter-mbp-prod")
        XCTAssertEqual(debug.keychainAccount(runnerId: "peter-mbp"), "graceful-mastiff-960:peter-mbp")
        XCTAssertEqual(release.launchAgentLabel, "co.warehaus.runner.prod")
        XCTAssertEqual(debug.launchAgentLabel, "co.warehaus.runner")
        XCTAssertEqual(release.setupArguments, ["setup", "--supervised", "--production"])
        XCTAssertEqual(debug.setupArguments, ["setup", "--supervised"])
    }

    func testPairingURLFillsTheCodeIn() {
        XCTAssertEqual(release.pairingURL(code: "k7qm-4xpa").absoluteString, "https://warehaus-portal.vercel.app/?runnerPair=K7QM-4XPA")
        XCTAssertEqual(debug.pairingURL(code: "K7QM-4XPA").absoluteString, "http://localhost:3100/?runnerPair=K7QM-4XPA")
    }
}

final class SetupOutputTests: XCTestCase {
    func testGitHubStatus() {
        let signedIn = """
        github.com
          ✓ Logged in to github.com account peterroquemore (keyring)
          - Active account: true
        """
        XCTAssertEqual(SetupOutput.githubLogin(fromStatus: signedIn), "peterroquemore")
        XCTAssertEqual(SetupOutput.githubLogin(fromStatus: "✓ Logged in to github.com as octocat (oauth_token)"), "octocat")
        XCTAssertNil(SetupOutput.githubLogin(fromStatus: "You are not logged into any GitHub hosts. To log in, run: gh auth login"))
    }

    func testGitHubDeviceCode() {
        XCTAssertEqual(SetupOutput.githubDeviceCode(in: "! First copy your one-time code: 1A2B-3C4D\nPress Enter to open"), "1A2B-3C4D")
        XCTAssertNil(SetupOutput.githubDeviceCode(in: "! First copy your one-time code: 1A"))
        XCTAssertNil(SetupOutput.githubDeviceCode(in: "Opening github.com"))
    }

    func testClaudeStatus() {
        XCTAssertEqual(SetupOutput.claude(fromStatus: #"{"loggedIn":true,"email":"a@b.co","authMethod":"claude.ai"}"#), .signedIn(email: "a@b.co"))
        XCTAssertEqual(SetupOutput.claude(fromStatus: #"{"loggedIn":false}"#), .signedOut)
        XCTAssertNil(SetupOutput.claude(fromStatus: "error: unknown command"))
    }

    func testPairingLines() {
        let line = #"@@warehaus {"type":"pairing","code":"K7QM-4XPA","runnerId":"peter-mbp-prod","expiresAt":1800000000000,"production":true,"at":1}"#
        XCTAssertEqual(PairingEvent.parse(line: line),
                       .pairing(PairingCode(code: "K7QM-4XPA", runnerId: "peter-mbp-prod", expiresAt: Date(timeIntervalSince1970: 1_800_000_000))))
        XCTAssertEqual(PairingEvent.parse(line: #"@@warehaus {"type":"paired","runnerId":"peter-mbp-prod","at":1}"#), .paired(runnerId: "peter-mbp-prod"))
        XCTAssertEqual(PairingEvent.parse(line: #"@@warehaus {"type":"pair_expired","at":1}"#), .expired)
        XCTAssertNil(PairingEvent.parse(line: "[runner] Pairing code: K7QM-4XPA"))
        XCTAssertNil(PairingEvent.parse(line: #"@@warehaus {"type":"idle","at":1}"#))
        XCTAssertNil(PairingEvent.parse(line: #"@@warehaus {"type":"pairing","at":1}"#))
    }
}

final class RuntimeLayoutTests: XCTestCase {
    let home = URL(fileURLWithPath: "/Users/staff")

    func testTheBundleLayout() {
        let layout = RuntimeLayout(resources: URL(fileURLWithPath: "/Applications/Warehaus Runner.app/Contents/Resources"))
        let root = "/Applications/Warehaus Runner.app/Contents/Resources/runner"
        XCTAssertEqual(layout.node.path, "\(root)/bin/node")
        XCTAssertEqual(layout.gh.path, "\(root)/bin/gh")
        XCTAssertEqual(layout.cli.path, "\(root)/tools/runner/src/cli.mjs")
        XCTAssertEqual(layout.protocolPackage.path, "\(root)/packages/runner-protocol/index.mjs")
        XCTAssertEqual(Array(layout.path(home: home).prefix(2)), ["\(root)/bin", "/Users/staff/.local/bin"])
        XCTAssertEqual(Array(layout.path(home: home).dropFirst(2)), RunnerInstallation.systemPath)
    }

    func testFindsAFilledBundleAndNothingElse() throws {
        let resources = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: resources) }
        let layout = RuntimeLayout(resources: resources)
        XCTAssertNil(BundledRunner(resources: resources, home: home).locate())

        let files = FileManager.default
        for url in [layout.node, layout.gh, layout.cli, layout.protocolPackage] {
            try files.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            files.createFile(atPath: url.path, contents: Data("#!/bin/sh\n".utf8))
        }
        // Not executable yet.
        XCTAssertNil(BundledRunner(resources: resources, home: home).locate())
        for url in [layout.node, layout.gh] {
            try files.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
        }
        let found = try XCTUnwrap(BundledRunner(resources: resources, home: home).locate())
        XCTAssertEqual(found.node, layout.node)
        XCTAssertEqual(found.cli, layout.cli)
        XCTAssertEqual(found.workingDirectory, layout.root)
        XCTAssertEqual(found.path.first, layout.bin.path)
    }

    /// scripts/bundle-runtime.sh writes the same layout. Keep the two in step.
    func testTheBundleScriptWritesThisLayout() throws {
        let script = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("scripts/bundle-runtime.sh")
        let text = try String(contentsOf: script, encoding: .utf8)
        for piece in ["Contents/Resources/runner", "\"$DEST/bin/node\"", "\"$DEST/bin/gh\"", "\"$DEST/tools/runner/\"", "\"$DEST/packages/runner-protocol/\""] {
            XCTAssertTrue(text.contains(piece), "bundle-runtime.sh no longer writes \(piece)")
        }
    }
}
