import Foundation
import XCTest
@testable import NativeBridge

/// Decodes the same examples as packages/native-bridge/index.test.mjs.
final class ContractTests: XCTestCase {
    struct Example {
        let name: String
        let direction: String
        let message: Any
    }

    private func examples(_ group: String) throws -> [Example] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // NativeBridgeTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // swift
            .deletingLastPathComponent() // native-bridge
            .appendingPathComponent("fixtures/messages.json")
        let data = try Data(contentsOf: url)
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) as? [String: Any])
        let list = try XCTUnwrap(root[group] as? [[String: Any]])
        return try list.map {
            Example(
                name: try XCTUnwrap($0["name"] as? String),
                direction: try XCTUnwrap($0["direction"] as? String),
                message: try XCTUnwrap($0["message"])
            )
        }
    }

    private func decode(_ example: Example) -> Result<Void, BridgeRefusal> {
        if example.direction == "shellToPage" {
            return BridgeDecoder.decodeShellMessage(example.message).map { _ in () }
        }
        return BridgeDecoder.decodePageMessage(example.message).map { _ in () }
    }

    func testAcceptsEveryValidExample() throws {
        let valid = try examples("valid")
        XCTAssertFalse(valid.isEmpty)
        for example in valid {
            if case let .failure(refusal) = decode(example) {
                XCTFail("refused \(example.name): \(refusal.reason)")
            }
        }
    }

    func testRefusesEveryInvalidExample() throws {
        let invalid = try examples("invalid")
        XCTAssertFalse(invalid.isEmpty)
        for example in invalid {
            if case .success = decode(example) {
                XCTFail("accepted \(example.name)")
            }
        }
    }

    func testShellMessagesRoundTripThroughTheDecoder() throws {
        let sent: [ShellMessage] = [
            .hello(appVersion: "1.0.0", capabilities: [.badge, .notify, .openExternal]),
            .navigate(url: "warehaus://milestone/abc"),
        ]
        for message in sent {
            let json = try JSONSerialization.data(withJSONObject: message.jsonObject())
            let back = try JSONSerialization.jsonObject(with: json)
            XCTAssertEqual(try BridgeDecoder.decodeShellMessage(back).get(), message)
        }
    }
}
