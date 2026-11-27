import XCTest
@testable import PortalWindow

final class PortalOriginsTests: XCTestCase {
    private func url(_ text: String) -> URL { URL(string: text)! }

    func testReleaseLoadsOnlyTheProductionPortal() {
        XCTAssertEqual(PortalOrigins.release.home, url("https://warehaus-portal.vercel.app/projects"))
        XCTAssertTrue(PortalOrigins.allowsHome(url("https://warehaus-portal.vercel.app/projects"), flavor: .release))
        XCTAssertTrue(PortalOrigins.allowsHome(url("https://WAREHAUS-PORTAL.vercel.app:443/"), flavor: .release))
        for refused in [
            "http://warehaus-portal.vercel.app/",
            "https://warehaus-portal-git-branch.vercel.app/",
            "https://warehaus-portal.vercel.app.evil.co/",
            "https://warehaus-portal.vercel.app:8443/",
            "https://user@warehaus-portal.vercel.app/",
            "http://localhost:3100/projects",
        ] {
            XCTAssertFalse(PortalOrigins.allowsHome(url(refused), flavor: .release), refused)
        }
    }

    func testDebugLoadsOnlyLocalhost() {
        XCTAssertEqual(PortalOrigins.debug()?.home, url("http://localhost:3100/projects"))
        XCTAssertNotNil(PortalOrigins.debug(home: url("http://localhost:3190/projects")))
        XCTAssertNotNil(PortalOrigins.debug(home: url("http://127.0.0.1:3100/")))
        XCTAssertNil(PortalOrigins.debug(home: url("https://warehaus-portal.vercel.app/projects")))
        XCTAssertNil(PortalOrigins.debug(home: url("http://localhost.evil.co:3100/")))
        XCTAssertNil(PortalOrigins.debug(home: url("http://192.168.1.4:3100/")))
    }

    func testDebugReadsPortalURLArgument() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "PortalOriginsTests"))
        defer { defaults.removePersistentDomain(forName: "PortalOriginsTests") }
        XCTAssertEqual(PortalOrigins.current(arguments: defaults)?.home, PortalOrigins.debugHome)
        defaults.set("http://localhost:3190/projects", forKey: "PortalURL")
        XCTAssertEqual(PortalOrigins.current(arguments: defaults)?.home, url("http://localhost:3190/projects"))
        defaults.set("https://warehaus-portal.vercel.app/projects", forKey: "PortalURL")
        XCTAssertNil(PortalOrigins.current(arguments: defaults))
    }

    func testIsPortalComparesSchemeHostAndPort() throws {
        let release = PortalOrigins.release
        XCTAssertTrue(release.isPortal(url("https://warehaus-portal.vercel.app/projects/abc?x=1")))
        XCTAssertTrue(release.isPortal(url("https://warehaus-portal.vercel.app:443/")))
        XCTAssertFalse(release.isPortal(url("http://warehaus-portal.vercel.app/")))
        XCTAssertFalse(release.isPortal(url("https://unique-turtle-383.convex.cloud/")))

        let debug = try XCTUnwrap(PortalOrigins.debug(home: url("http://localhost:3190/projects")))
        XCTAssertTrue(debug.isPortal(url("http://localhost:3190/resources")))
        XCTAssertFalse(debug.isPortal(url("http://localhost:3100/resources")))
        XCTAssertFalse(debug.isPortal(url("http://127.0.0.1:3190/")))
    }
}
