import NativeBridge
import XCTest
@testable import PortalWindow

final class ShellScriptTests: XCTestCase {
    /// Pulls the detail JSON back out of the script and decodes it as the page would.
    private func detail(of script: String) throws -> Any {
        let prefix = #"window.dispatchEvent(new CustomEvent("warehaus:shell",{detail:"#
        let suffix = "}));"
        XCTAssertTrue(script.hasPrefix(prefix), script)
        XCTAssertTrue(script.hasSuffix(suffix), script)
        let json = script.dropFirst(prefix.count).dropLast(suffix.count)
        return try JSONSerialization.jsonObject(with: Data(json.utf8))
    }

    func testHelloScript() throws {
        let script = ShellScript.dispatch(ShellScript.hello(appVersion: "0.1.0"))
        XCTAssertEqual(
            script,
            #"window.dispatchEvent(new CustomEvent("warehaus:shell",{detail:{"appVersion":"0.1.0","bridgeVersion":1,"capabilities":["openExternal"],"platform":"macos","type":"shell.hello"}}));"#
        )
        let decoded = BridgeDecoder.decodeShellMessage(try detail(of: script))
        XCTAssertEqual(try decoded.get(), .hello(appVersion: "0.1.0", capabilities: [.openExternal]))
    }

    func testNavigateScriptCarriesTheRawLink() throws {
        let link = #"warehaus://milestone/abc?task=3&note="hi"</script>"#
        let script = ShellScript.dispatch(.navigate(url: link))
        XCTAssertFalse(script.contains("</script>"), "slashes are escaped")
        let decoded = BridgeDecoder.decodeShellMessage(try detail(of: script))
        XCTAssertEqual(try decoded.get(), .navigate(url: link))
    }

    func testAppVersionFallsBackWhenThePageWouldRefuseIt() {
        XCTAssertEqual(ShellScript.appVersion("1.4.0"), "1.4.0")
        XCTAssertEqual(ShellScript.appVersion("1.4"), "0.0.0")
        XCTAssertEqual(ShellScript.appVersion("dev"), "0.0.0")
        XCTAssertEqual(ShellScript.appVersion(nil), "0.0.0")
    }

    func testPageMessages() throws {
        XCTAssertEqual(
            PageAction.from(["type": "openExternal", "url": "https://github.com/warehaus"]),
            .openExternal(URL(string: "https://github.com/warehaus")!)
        )
        XCTAssertEqual(PageAction.from(["type": "attention", "count": 2, "alerts": []]), .ignore)
        XCTAssertEqual(PageAction.from(["type": "openExternal", "url": "http://github.com"]), .refuse("url must be an https link"))
        XCTAssertEqual(PageAction.from(["type": "openExternal", "url": "file:///etc/passwd"]), .refuse("url must be an https link"))
        XCTAssertEqual(PageAction.from(["type": "navigate", "url": "warehaus://x"]), .refuse("navigate is not a page to shell message"))
        XCTAssertEqual(PageAction.from("hello"), .refuse("message must be an object"))
    }

    func testConvexGuardBlocksProductionOnly() throws {
        let rules = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(ConvexGuard.contentRules.utf8)) as? [[String: [String: String]]])
        XCTAssertEqual(rules.count, 1)
        XCTAssertEqual(rules[0]["action"]?["type"], "block")
        let pattern = try XCTUnwrap(rules[0]["trigger"]?["url-filter"])
        let regex = try NSRegularExpression(pattern: pattern)
        func blocks(_ text: String) -> Bool {
            regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
        }
        XCTAssertTrue(blocks("wss://unique-turtle-383.convex.cloud/api/1.0/sync"))
        XCTAssertTrue(blocks("https://unique-turtle-383.convex.site/agent/claim"))
        XCTAssertFalse(blocks("wss://graceful-mastiff-960.convex.cloud/api/1.0/sync"))
        XCTAssertFalse(blocks("http://localhost:3190/projects"))
        XCTAssertTrue(ConvexGuard.userScript.contains(#""unique-turtle-383""#))
    }
}
