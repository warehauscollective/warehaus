// swift-tools-version:5.10
// The Swift copy of the native bridge (ADR-0006, decision 7). The Mac app in
// apps/mac depends on this package. Its tests decode ../fixtures/messages.json,
// the same examples the TypeScript copy decodes.
import PackageDescription

let package = Package(
    name: "NativeBridge",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "NativeBridge", targets: ["NativeBridge"]),
    ],
    targets: [
        .target(name: "NativeBridge"),
        .testTarget(name: "NativeBridgeTests", dependencies: ["NativeBridge"]),
    ]
)
