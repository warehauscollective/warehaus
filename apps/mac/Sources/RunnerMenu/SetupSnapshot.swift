#if DEBUG
import AppKit
import RunnerSupervisor
import SwiftUI

/// Debug only: writes the checklist and pairing windows for every setup
/// fixture, Dark and Light, as PNGs for the design check, then quits.
///
///     -SetupSnapshot <folder>
///
/// The window chrome is drawn here (title and traffic lights) so the shots
/// line up with the Figma frames; no screen recording is needed.
@MainActor
enum SetupSnapshot {
    /// True when asked: the shots are written on the next main-loop turn (not
    /// inside the SwiftUI update that creates the model), then the app quits.
    static func scheduleIfAsked(arguments: UserDefaults = .standard) -> Bool {
        guard let folder = arguments.string(forKey: "SetupSnapshot") else { return false }
        DispatchQueue.main.async { MainActor.assumeIsolated { run(folder: folder) } }
        return true
    }

    static func run(folder: String) {
        let out = URL(fileURLWithPath: folder, isDirectory: true)
        try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        let now = Date()
        for name in FixtureSetupSystem.names {
            guard let fixture = FixtureSetupSystem(named: name, now: now) else { continue }
            for policy in [DeploymentPolicy(flavor: .release)] {
                let model = SetupModel(policy: policy, system: fixture, facts: fixture.facts, showsPairing: fixture.showsPairing, now: now)
                for dark in [true, false] {
                    let suffix = dark ? "dark" : "light"
                    write(Chrome { SetupChecklistView(model: model) }, dark: dark, to: out.appendingPathComponent("checklist-\(name)-\(suffix).png"))
                    if fixture.showsPairing {
                        write(Chrome { PairingView(model: model) {} }, dark: dark, to: out.appendingPathComponent("pairing-\(name)-\(suffix).png"))
                    }
                }
            }
        }
        print("Wrote setup snapshots to \(out.path)")
        exit(0)
    }

    static func write<V: View>(_ view: V, dark: Bool, to url: URL) {
        let host = NSHostingView(rootView: view)
        host.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
        host.frame.size = host.fittingSize
        host.layoutSubtreeIfNeeded()
        let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.appearance = host.appearance
        window.contentView = host
        host.display()
        guard let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return }
        host.cacheDisplay(in: host.bounds, to: rep)
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
    }
}

/// The window frame from the design: traffic lights, "Warehaus runner", the content.
private struct Chrome<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { _ in Circle().fill(Color.secondary.opacity(0.45)).frame(width: 12, height: 12) }
                Text("Warehaus runner").font(.system(size: 13)).foregroundStyle(.secondary).padding(.leading, 4)
            }
            .padding(.horizontal, 14)
            .frame(height: 40)
            content()
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(SetupColors.cardBorder))
        .padding(20)
    }
}
#endif
