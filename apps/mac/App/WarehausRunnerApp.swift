import RunnerMenu
import SwiftUI

/// Warehaus Portal: shows the Portal in its own window and keeps the runner
/// going from the menu bar on a staff Mac. Everything lives in the
/// RunnerMenu, RunnerSupervisor and PortalWindow modules in apps/mac/Sources;
/// this target only signs, bundles and launches them.
@main
struct WarehausRunnerApp: App {
    @NSApplicationDelegateAdaptor(RunnerAppDelegate.self) private var delegate
    @StateObject private var model = RunnerAppModel.live()

    var body: some Scene {
        RunnerScenes(model: model)
    }
}
