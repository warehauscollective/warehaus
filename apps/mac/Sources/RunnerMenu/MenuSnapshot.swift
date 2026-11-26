#if DEBUG
import AppKit
import RunnerSupervisor
import SwiftUI

/// Debug only: writes the menu bar dropdown for every runner fixture, Dark
/// and Light, as PNGs for the design check, then quits. No runner starts.
///
///     -MenuSnapshot <folder>
@MainActor
enum MenuSnapshot {
    static let names = ["ready", "working", "working-several", "paused", "attention", "waiting", "waiting-working"]

    static func asked(arguments: UserDefaults = .standard) -> Bool {
        arguments.string(forKey: "MenuSnapshot") != nil
    }

    /// `model` builds the app model on a fixture control. The shots are written
    /// on the next main-loop turn, then the app quits.
    static func scheduleIfAsked(arguments: UserDefaults = .standard, model: @escaping @MainActor (FixtureControl) -> RunnerAppModel) {
        guard let folder = arguments.string(forKey: "MenuSnapshot") else { return }
        DispatchQueue.main.async { MainActor.assumeIsolated { run(folder: folder, model: model) } }
    }

    static func run(folder: String, model: @MainActor (FixtureControl) -> RunnerAppModel) {
        let out = URL(fileURLWithPath: folder, isDirectory: true)
        try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
        for name in names {
            guard let fixture = FixtureControl(named: name) else { continue }
            let app = model(fixture)
            for dark in [true, false] {
                let view = RunnerMenuView(model: app)
                    .background(Color(nsColor: .windowBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(20)
                SetupSnapshot.write(view, dark: dark, to: out.appendingPathComponent("menu-\(name)-\(dark ? "dark" : "light").png"))
            }
        }
        print("Wrote menu snapshots to \(out.path)")
        exit(0)
    }
}
#endif
