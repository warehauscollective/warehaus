import NativeBridge
import XCTest
@testable import PortalWindow

/// AttentionAlert has no public initializer, so tests build alerts the way the
/// window gets them: decoded from a page message.
enum Fixture {
    static func alert(_ id: String, kind: String = "ask", title: String = "Runner on production", url: String = "warehaus://milestone/m1?project=p1", cause: String? = nil) -> AttentionAlert {
        var alert: [String: Any] = ["id": id, "kind": kind, "title": title, "url": url, "createdAt": 1_795_000_000_000]
        if let cause { alert["cause"] = cause }
        let message: [String: Any] = ["type": "attention", "count": 1, "alerts": [alert]]
        guard case let .success(.attention(_, alerts)) = BridgeDecoder.decodePageMessage(message) else {
            fatalError("fixture alert did not decode")
        }
        return alerts[0]
    }
}

final class AttentionAlertsTests: XCTestCase {
    func testFirstAttentionAfterLaunchSeedsWithoutNotifying() {
        let store = MemorySeenAlertStore()
        var tracker = AlertTracker(store: store)
        XCTAssertEqual(tracker.receive([Fixture.alert("a"), Fixture.alert("b")]), [])
        XCTAssertEqual(store.ids, ["a", "b"])
        XCTAssertEqual(tracker.receive([Fixture.alert("a"), Fixture.alert("b"), Fixture.alert("c")]).map(\.id), ["c"])
        XCTAssertEqual(store.ids, ["a", "b", "c"])
    }

    func testSeenAlertsNeverNotifyTwiceAcrossRelaunch() {
        let store = MemorySeenAlertStore()
        var first = AlertTracker(store: store)
        _ = first.receive([])
        XCTAssertEqual(first.receive([Fixture.alert("a")]).map(\.id), ["a"])
        XCTAssertEqual(first.receive([Fixture.alert("a")]), [])

        var relaunch = AlertTracker(store: store)
        _ = relaunch.receive([])
        XCTAssertEqual(relaunch.receive([Fixture.alert("a"), Fixture.alert("b")]).map(\.id), ["b"])
    }

    func testDuplicateIdsInOneMessageNotifyOnce() {
        var tracker = AlertTracker(store: MemorySeenAlertStore())
        _ = tracker.receive([])
        XCTAssertEqual(tracker.receive([Fixture.alert("a"), Fixture.alert("a")]).map(\.id), ["a"])
    }

    func testStoreKeepsTheNewestTwoHundred() {
        let store = MemorySeenAlertStore(ids: (0..<200).map { "old\($0)" })
        var tracker = AlertTracker(store: store)
        _ = tracker.receive([])
        XCTAssertEqual(tracker.receive([Fixture.alert("new1"), Fixture.alert("new2")]).map(\.id), ["new1", "new2"])
        XCTAssertEqual(store.ids.count, AlertTracker.limit)
        XCTAssertEqual(store.ids.first, "old2")
        XCTAssertEqual(store.ids.suffix(2), ["new1", "new2"])
    }

    func testDefaultsStoreRoundTrips() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "AttentionAlertsTests"))
        defer { defaults.removePersistentDomain(forName: "AttentionAlertsTests") }
        let store = DefaultsSeenAlertStore(defaults: defaults)
        XCTAssertEqual(store.ids, [])
        store.ids = ["a", "b"]
        XCTAssertEqual(DefaultsSeenAlertStore(defaults: defaults).ids, ["a", "b"])
    }

    func testBadgeText() {
        XCTAssertNil(DockBadge.label(count: 0))
        XCTAssertEqual(DockBadge.label(count: 1), "1")
        XCTAssertEqual(DockBadge.label(count: 2), "2")
        XCTAssertEqual(DockBadge.label(count: 120), "120")
    }

    func testNeedsYouWordingMatchesTheDesign() {
        let content = AlertNotificationContent(Fixture.alert("a", kind: "ask", title: "Runner on production"))
        XCTAssertEqual(content.title, "Needs you: Runner on production")
        XCTAssertEqual(content.body, "Ready to Ship and waiting on your approval. Approve it or request changes.")
        XCTAssertEqual(content.identifier, "portal.alert.a")
    }

    func testBlockedAskLeadsWithItsCauseAndKeepsTheTaskLink() {
        let link = "warehaus://task/t1?section=troubleshoot"
        let bodies = [
            "needs_input": "Needs input. Open the task to answer and rerun.",
            "failed": "Failed. Open the task to see why and rerun.",
            "stalled": "Stalled. Open the task to see why and rerun.",
        ]
        for (cause, body) in bodies {
            let content = AlertNotificationContent(Fixture.alert("a", title: "Run troubleshooting", url: link, cause: cause))
            XCTAssertEqual(content.title, "Needs you: Run troubleshooting")
            XCTAssertEqual(content.body, body)
            XCTAssertEqual(AlertNotificationContent.link(fromUserInfo: content.userInfo), link)
        }
    }

    func testReadyToShipWordingMatchesTheDesign() {
        let content = AlertNotificationContent(Fixture.alert("b", kind: "readyToShip", title: "Mac app: Portal window"))
        XCTAssertEqual(content.title, "Ready to Ship: Mac app: Portal window")
        XCTAssertEqual(content.body, "The local preview is ready. Open the milestone to review it.")
    }

    func testCapabilitiesFollowPermission() {
        XCTAssertEqual(NotificationPermission.authorized.capabilities, [.badge, .notify, .openExternal])
        XCTAssertEqual(NotificationPermission.denied.capabilities, [.badge, .openExternal])
        XCTAssertEqual(NotificationPermission.notDetermined.capabilities, [.badge, .openExternal])
    }

    func testClickCarriesTheRawLinkToNavigate() throws {
        let link = "warehaus://milestone/m-launch?project=p-site"
        let content = AlertNotificationContent(Fixture.alert("a", url: link))
        let userInfo: [AnyHashable: Any] = content.userInfo
        XCTAssertEqual(userInfo["source"] as? String, "portal")
        let clicked = try XCTUnwrap(AlertNotificationContent.link(fromUserInfo: userInfo))
        XCTAssertEqual(clicked, link)
        XCTAssertEqual(
            ShellScript.dispatch(.navigate(url: clicked)),
            #"window.dispatchEvent(new CustomEvent("warehaus:shell",{detail:{"type":"navigate","url":"warehaus:\/\/milestone\/m-launch?project=p-site"}}));"#
        )
    }

    func testClickFromAnotherSourceOrWithABadLinkIsIgnored() {
        XCTAssertNil(AlertNotificationContent.link(fromUserInfo: ["source": "runner", "url": "warehaus://task/t"]))
        XCTAssertNil(AlertNotificationContent.link(fromUserInfo: ["source": "portal", "url": "https://example.com"]))
        XCTAssertNil(AlertNotificationContent.link(fromUserInfo: ["source": "portal"]))
    }

    func testDebugFixturesDecode() throws {
        for name in ["needs-you", "ready-to-ship", "both", "clear"] {
            let message = try XCTUnwrap(PortalWindowController.attentionFixture(named: name, stamp: 1))
            guard case .success(.attention) = BridgeDecoder.decodePageMessage(message) else {
                return XCTFail("\(name) did not decode")
            }
        }
        XCTAssertNil(PortalWindowController.attentionFixture(named: "nope", stamp: 1))
    }
}

/// The window's attention handling against a fake notifier.
@MainActor
final class AttentionHandlingTests: XCTestCase {
    final class FakeNotifier: AlertNotifying {
        var granted: NotificationPermission
        var current: NotificationPermission = .notDetermined
        var requests = 0
        var posted: [AlertNotificationContent] = []
        var badges: [String?] = []
        init(grants: NotificationPermission) { granted = grants }
        func permission() async -> NotificationPermission { current }
        func requestPermission() async -> NotificationPermission { requests += 1; current = granted; return current }
        func post(_ content: AlertNotificationContent) { posted.append(content) }
        func setBadge(_ label: String?) { badges.append(label) }
    }

    private func controller(_ notifier: FakeNotifier) -> PortalWindowController {
        PortalWindowController(origins: .release, appVersion: "0.1.0", notifier: notifier, seenAlerts: MemorySeenAlertStore())
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
    }

    func testAsksPermissionOnlyWhenAnAlertWouldNotify() async {
        let notifier = FakeNotifier(grants: .authorized)
        let window = controller(notifier)
        window.handleAttention(count: 1, alerts: [Fixture.alert("a")])
        await settle()
        XCTAssertEqual(notifier.requests, 0, "the launch seed never asks")
        XCTAssertEqual(notifier.badges, ["1"])

        window.handleAttention(count: 2, alerts: [Fixture.alert("a"), Fixture.alert("b", kind: "readyToShip", title: "Mac app: Portal window")])
        await settle()
        XCTAssertEqual(notifier.requests, 1)
        XCTAssertEqual(notifier.posted.map(\.title), ["Ready to Ship: Mac app: Portal window"])
        XCTAssertEqual(window.permission, .authorized)

        window.handleAttention(count: 0, alerts: [])
        await settle()
        XCTAssertEqual(notifier.badges, ["1", "2", nil])
    }

    func testDeniedStillBadgesButNeverPosts() async {
        let notifier = FakeNotifier(grants: .denied)
        let window = controller(notifier)
        window.handleAttention(count: 0, alerts: [])
        window.handleAttention(count: 3, alerts: [Fixture.alert("a")])
        await settle()
        XCTAssertEqual(notifier.posted, [])
        XCTAssertEqual(notifier.badges.last, "3")
        XCTAssertEqual(window.permission.capabilities, [.badge, .openExternal])
    }
}
