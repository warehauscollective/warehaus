import Foundation
import XCTest
@testable import RunnerMenu

/// The live swapper against real folders: a renamed app lands at its new name
/// next to the old one, and a rollback puts the old app back where it was.
@MainActor
final class AppSwapperTests: XCTestCase {
    private var folder: URL!

    override func setUp() async throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("AppSwapperTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: folder)
    }

    private func makeApp(_ path: String, marker: String) throws -> URL {
        let app = folder.appendingPathComponent(path, isDirectory: true)
        try FileManager.default.createDirectory(at: app.appendingPathComponent("Contents"), withIntermediateDirectories: true)
        try Data(marker.utf8).write(to: app.appendingPathComponent("Contents/marker"))
        return app
    }

    private func marker(_ app: URL) -> String? {
        (try? Data(contentsOf: app.appendingPathComponent("Contents/marker"))).flatMap { String(data: $0, encoding: .utf8) }
    }

    func testARenamedAppLandsAtItsNewName() throws {
        let installed = try makeApp("Applications/Warehaus Runner.app", marker: "old")
        let newApp = try makeApp("Updates/unzipped/Warehaus Portal.app", marker: "new")
        let swapper = LiveAppSwapper(installed: installed, root: folder.appendingPathComponent("Updates"))

        try swapper.swap(in: newApp)

        let renamed = folder.appendingPathComponent("Applications/Warehaus Portal.app")
        XCTAssertEqual(marker(renamed), "new")
        XCTAssertFalse(FileManager.default.fileExists(atPath: installed.path))
    }

    func testRollingBackARenamedAppRestoresTheOldName() throws {
        let installed = try makeApp("Applications/Warehaus Runner.app", marker: "old")
        let newApp = try makeApp("Updates/unzipped/Warehaus Portal.app", marker: "new")
        let swapper = LiveAppSwapper(installed: installed, root: folder.appendingPathComponent("Updates"))

        try swapper.swap(in: newApp)
        try swapper.rollBack(stopping: 0)

        XCTAssertEqual(marker(installed), "old")
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.appendingPathComponent("Applications/Warehaus Portal.app").path))
    }

    func testTheSameNameStillReplacesInPlace() throws {
        let installed = try makeApp("Applications/Warehaus Portal.app", marker: "old")
        let newApp = try makeApp("Updates/unzipped/Warehaus Portal.app", marker: "new")
        let swapper = LiveAppSwapper(installed: installed, root: folder.appendingPathComponent("Updates"))

        try swapper.swap(in: newApp)

        XCTAssertEqual(marker(installed), "new")
    }

    func testARenamedAppNeverOverwritesAnotherCopy() throws {
        let installed = try makeApp("Applications/Warehaus Runner.app", marker: "old")
        let other = try makeApp("Applications/Warehaus Portal.app", marker: "other")
        let newApp = try makeApp("Updates/unzipped/Warehaus Portal.app", marker: "new")
        let swapper = LiveAppSwapper(installed: installed, root: folder.appendingPathComponent("Updates"))

        XCTAssertThrowsError(try swapper.swap(in: newApp))

        XCTAssertEqual(marker(installed), "old")
        XCTAssertEqual(marker(other), "other")
    }
}
