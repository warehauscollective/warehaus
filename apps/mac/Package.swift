// swift-tools-version:5.10
// The Warehaus Mac app's modules (ADR-0006, decision 8). The app target in
// WarehausRunner.xcodeproj is a thin @main that links RunnerMenu.
//
// - RunnerSupervisor: starts the bundled Node runner headless, reads its state
//   lines, pauses, resumes and removes it. Foundation only, no UI.
// - PortalWindow: the Portal in one WKWebView window, the Mac adapter of the
//   native bridge (packages/native-bridge/swift) and warehaus:// links.
// - RunnerMenu: the menu bar dropdown, the Remove confirm dialog, the login
//   item, act-only notifications and the update seam. Sits on both modules.
//
// PortalWindow never imports RunnerSupervisor, and RunnerSupervisor never
// imports PortalWindow. Only the menu knows about both.
import PackageDescription

let package = Package(
    name: "WarehausMac",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "RunnerSupervisor", targets: ["RunnerSupervisor"]),
        .library(name: "PortalWindow", targets: ["PortalWindow"]),
        .library(name: "RunnerMenu", targets: ["RunnerMenu"]),
    ],
    dependencies: [
        .package(name: "NativeBridge", path: "../../packages/native-bridge/swift"),
    ],
    targets: [
        .target(name: "RunnerSupervisor"),
        .target(name: "PortalWindow", dependencies: [.product(name: "NativeBridge", package: "NativeBridge")]),
        .target(name: "RunnerMenu", dependencies: ["RunnerSupervisor", "PortalWindow"]),
        .testTarget(name: "RunnerSupervisorTests", dependencies: ["RunnerSupervisor"]),
        .testTarget(
            name: "PortalWindowTests",
            dependencies: ["PortalWindow", .product(name: "NativeBridge", package: "NativeBridge")]
        ),
        .testTarget(name: "RunnerMenuTests", dependencies: ["RunnerMenu", "RunnerSupervisor"]),
    ]
)
