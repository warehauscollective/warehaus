import XCTest
@testable import PortalWindow

final class LinkRouterTests: XCTestCase {
    private func url(_ text: String) -> URL { URL(string: text)! }
    private let release = PortalOrigins.release

    func testPortalPagesStayInTheWindow() {
        XCTAssertEqual(LinkRouter.decide(url("https://warehaus-portal.vercel.app/resources"), isMainFrame: true, origins: release), .allow)
        XCTAssertEqual(LinkRouter.decide(url("about:blank"), isMainFrame: true, origins: release), .allow)
    }

    func testOtherLinksGoToTheBrowser() {
        let github = url("https://github.com/warehaus/warehaus/pull/1")
        XCTAssertEqual(LinkRouter.decide(github, isMainFrame: true, origins: release), .openInBrowser(github))
        let mail = url("mailto:hello@example.com")
        XCTAssertEqual(LinkRouter.decide(mail, isMainFrame: true, origins: release), .openInBrowser(mail))
        let preview = url("http://localhost:3200/")
        XCTAssertEqual(LinkRouter.decide(preview, isMainFrame: true, origins: release), .openInBrowser(preview))
    }

    func testOtherSchemesAreCancelled() {
        XCTAssertEqual(LinkRouter.decide(url("file:///etc/passwd"), isMainFrame: true, origins: release), .cancel)
        XCTAssertEqual(LinkRouter.decide(url("javascript:alert(1)"), isMainFrame: true, origins: release), .cancel)
        XCTAssertEqual(LinkRouter.decide(url("ssh://host"), isMainFrame: true, origins: release), .cancel)
    }

    func testPortalLinksAreForwardedRaw() {
        let link = "warehaus://milestone/nn77zctgc8wm54zmdkfxr5zntd8jwsh4?task=3"
        XCTAssertEqual(LinkRouter.decide(url(link), isMainFrame: true, origins: release), .forwardToPortal(link))
        XCTAssertEqual(LinkRouter.decide(url(link), isMainFrame: false, origins: release), .forwardToPortal(link))
    }

    func testEmbedsLoadInTheirFrameOnly() {
        XCTAssertEqual(LinkRouter.decide(url("https://www.figma.com/embed?x"), isMainFrame: false, origins: release), .allow)
        XCTAssertEqual(LinkRouter.decide(url("http://example.com/"), isMainFrame: false, origins: release), .cancel)
        XCTAssertEqual(LinkRouter.decide(url("file:///tmp/x"), isMainFrame: false, origins: release), .cancel)
    }

    func testDebugTreatsOnlyItsLocalhostAsPortal() throws {
        let debug = try XCTUnwrap(PortalOrigins.debug(home: url("http://localhost:3190/projects")))
        XCTAssertEqual(LinkRouter.decide(url("http://localhost:3190/activity"), isMainFrame: true, origins: debug), .allow)
        let production = url("https://warehaus-portal.vercel.app/projects")
        XCTAssertEqual(LinkRouter.decide(production, isMainFrame: true, origins: debug), .openInBrowser(production))
    }

    func testPortalLinkAcceptsOnlyTheWarehausScheme() {
        XCTAssertEqual(PortalLink.accept("warehaus://ask/123"), "warehaus://ask/123")
        XCTAssertEqual(PortalLink.accept("WAREHAUS://ask/123"), "WAREHAUS://ask/123")
        XCTAssertNil(PortalLink.accept("https://warehaus-portal.vercel.app/"))
        XCTAssertNil(PortalLink.accept("not a link"))
    }
}
