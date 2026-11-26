import NotificationRouting
import XCTest

@MainActor
final class NotificationRouterTests: XCTestCase {
    func testRoutesByUserInfoSource() {
        let router = NotificationRouter()
        var portal: [String] = []
        var runner = 0
        router.register(source: "portal") { portal.append($0["url"] as? String ?? "") }
        router.register(source: "runner") { _ in runner += 1 }

        XCTAssertTrue(router.route(["source": "portal", "url": "warehaus://task/t"]))
        XCTAssertTrue(router.route(["source": "runner"]))
        XCTAssertFalse(router.route(["source": "other"]))
        XCTAssertFalse(router.route([:]))
        XCTAssertEqual(portal, ["warehaus://task/t"])
        XCTAssertEqual(runner, 1)
    }

    func testSourceOf() {
        XCTAssertEqual(NotificationRouter.source(of: ["source": "runner"]), "runner")
        XCTAssertNil(NotificationRouter.source(of: ["source": 3]))
    }
}
