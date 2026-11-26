// swift-tools-version:5.10
// The Warehaus Mac app's modules (ADR-0006, decision 8). The app target in
// WarehausRunner.xcodeproj is a thin @main that links RunnerMenu.
//
// - RunnerSupervisor: starts the bundled Node runner headless, reads its state
//   lines, pauses, resumes and removes it. Foundation only, no UI.
// - RunnerMenu: the menu bar dropdown, the Remove confirm dialog, the login
//   item, act-only notifications and the update seam. Built on RunnerSupervisor.
//
// The Portal window ("Mac app: Portal window") becomes its own module beside
// these. It never imports RunnerSupervisor, and RunnerSupervisor never imports it.
import PackageDescription

let package = Package(
    name: "WarehausMac",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "RunnerSupervisor", targets: ["RunnerSupervisor"]),
        .library(name: "RunnerMenu", targets: ["RunnerMenu"]),
    ],
    targets: [
        .target(name: "RunnerSupervisor"),
        .target(name: "RunnerMenu", dependencies: ["RunnerSupervisor"]),
        .testTarget(name: "RunnerSupervisorTests", dependencies: ["RunnerSupervisor"]),
        .testTarget(name: "RunnerMenuTests", dependencies: ["RunnerMenu", "RunnerSupervisor"]),
    ]
)
