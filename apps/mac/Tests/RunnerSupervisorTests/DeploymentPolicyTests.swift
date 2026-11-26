import XCTest
@testable import RunnerSupervisor

/// Production only: release never pairs to dev; debug refuses unique-turtle-383.
final class DeploymentPolicyTests: XCTestCase {
    let release = DeploymentPolicy(flavor: .release)
    let debug = DeploymentPolicy(flavor: .debug)

    func testReleaseRunsProductionOnly() {
        XCTAssertTrue(release.allows(agentURL: "https://unique-turtle-383.convex.site"))
        XCTAssertFalse(release.allows(agentURL: "https://graceful-mastiff-960.convex.site"))
        XCTAssertFalse(release.allows(agentURL: "https://unique-turtle-383.convex.site.evil.test"))
        XCTAssertFalse(release.allows(agentURL: "http://unique-turtle-383.convex.site"))
        XCTAssertFalse(release.allows(agentURL: "not a url"))
        XCTAssertEqual(release.configFileName, "runner.prod.env")
        XCTAssertEqual(release.runnerArguments(paused: false), ["start", "--supervised", "--mode", "headless", "--production"])
        XCTAssertEqual(release.removeArguments, ["remove", "--production"])
        XCTAssertEqual(release.portalURL.host, "warehaus-portal.vercel.app")
    }

    func testDebugRefusesProduction() {
        XCTAssertFalse(debug.allows(agentURL: "https://unique-turtle-383.convex.site"))
        XCTAssertTrue(debug.allows(agentURL: "https://graceful-mastiff-960.convex.site"))
        XCTAssertEqual(debug.configFileName, "runner.env")
        XCTAssertFalse(debug.runnerArguments(paused: true).contains("--production"))
        XCTAssertEqual(debug.runnerArguments(paused: true).last, "--paused")
        XCTAssertEqual(debug.removeArguments, ["remove"])
        XCTAssertEqual(debug.portalURL.host, "localhost")
    }

    /// The Node runner and this app name the same deployments.
    func testMatchesTheRunner() throws {
        let lib = try String(contentsOf: repoFile("tools/runner/src/lib.mjs"), encoding: .utf8)
        XCTAssertTrue(lib.contains("export const PRODUCTION_DEPLOYMENT = '\(DeploymentPolicy.productionDeployment)';"))
        XCTAssertTrue(lib.contains("export const DEV_DEPLOYMENT = '\(DeploymentPolicy.devDeployment)';"))
        XCTAssertTrue(lib.contains("configFile: '\(release.configFileName)'"))
        XCTAssertTrue(lib.contains("configFile: '\(debug.configFileName)'"))
    }

    func testReadsTheFileSetupWrites() {
        let text = """
        # Warehaus runner, production. Written by npm run runner -- setup.
        # The secret is in the macOS Keychain, not here.
        PORTAL_AGENT_URL=https://unique-turtle-383.convex.site
        RUNNER_ID=peter-mbp-prod
        RUNNER_PRODUCTION=1

        """
        XCTAssertEqual(Pairing.parse(text), productionPairing)
        XCTAssertNil(Pairing.parse("PORTAL_AGENT_URL=https://x.convex.site\n"))
        XCTAssertEqual(Pairing.parse("RUNNER_ID=\"a1\"\nPORTAL_AGENT_URL='x'\n")?.runnerId, "a1")
    }
}
