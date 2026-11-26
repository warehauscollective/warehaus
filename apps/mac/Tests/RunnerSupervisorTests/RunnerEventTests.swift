import XCTest
@testable import RunnerSupervisor

/// The state lines tools/runner/src/cli.mjs prints with --supervised.
final class RunnerEventTests: XCTestCase {
    func testParsesEveryStateLine() {
        XCTAssertEqual(
            RunnerEvent.parse(line: #"@@warehaus {"type":"started","runnerId":"peter-mbp-prod","production":true,"paused":false,"at":1}"#),
            .started(runnerId: "peter-mbp-prod", production: true, paused: false)
        )
        XCTAssertEqual(RunnerEvent.parse(line: #"@@warehaus {"type":"idle","at":1}"#), .idle)
        XCTAssertEqual(RunnerEvent.parse(line: #"@@warehaus {"type":"paused","at":1}"#), .paused)
        XCTAssertEqual(
            RunnerEvent.parse(line: #"@@warehaus {"type":"working","kind":"task","milestoneId":"m1","milestone":"Launch","taskOrder":3,"task":"Hero","at":1}"#),
            .working(WorkInfo(kind: .task, milestoneId: "m1", milestone: "Launch", taskOrder: 3, task: "Hero"))
        )
        XCTAssertEqual(
            RunnerEvent.parse(line: #"@@warehaus {"type":"finished","kind":"planning","milestoneId":null,"milestone":"Launch","status":"done","at":1}"#),
            .finished(WorkInfo(kind: .planning, milestone: "Launch"), status: "done")
        )
        XCTAssertEqual(RunnerEvent.parse(line: #"@@warehaus {"type":"attention","reason":"github","at":1}"#), .attention(.github))
        XCTAssertEqual(RunnerEvent.parse(line: #"@@warehaus {"type":"attention","reason":"out_of_date","at":1}"#), .attention(.outOfDate))
    }

    func testIgnoresLogLinesAndAnythingUnknown() {
        XCTAssertNil(RunnerEvent.parse(line: "[runner] Nothing to do. Waiting."))
        XCTAssertNil(RunnerEvent.parse(line: "@@warehaus not json"))
        XCTAssertNil(RunnerEvent.parse(line: #"@@warehaus {"type":"dancing"}"#))
        XCTAssertNil(RunnerEvent.parse(line: #"@@warehaus {"type":"attention","reason":"bored"}"#))
        XCTAssertNil(RunnerEvent.parse(line: #"@@warehaus {"type":"working","kind":"nap","milestone":"x"}"#))
        XCTAssertNil(RunnerEvent.parse(line: #"@@warehaus {"type":"started"}"#))
    }

    /// The runner's ATTENTION_REASONS must each decode here.
    func testKnowsEveryReasonTheRunnerSends() throws {
        let lib = try String(contentsOf: repoFile("tools/runner/src/lib.mjs"), encoding: .utf8)
        let line = try XCTUnwrap(lib.split(separator: "\n").first { $0.contains("export const ATTENTION_REASONS") })
        let names = line.split(separator: "'").enumerated().filter { $0.offset % 2 == 1 }.map { String($0.element) }
        XCTAssertFalse(names.isEmpty)
        for name in names { XCTAssertNotNil(AttentionReason(rawValue: name), name) }
        XCTAssertTrue(lib.contains("export const SUPERVISOR_PREFIX = '\(RunnerEvent.prefix)';"))
    }
}

func repoFile(_ path: String, file: StaticString = #filePath) -> URL {
    // apps/mac/Tests/RunnerSupervisorTests/<file> is five levels below the repository root.
    var url = URL(fileURLWithPath: "\(file)")
    for _ in 0..<5 { url.deleteLastPathComponent() }
    return url.appendingPathComponent(path)
}
