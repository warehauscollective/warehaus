import RunnerMenu
import SwiftUI

/// Warehaus Runner: the menu bar app that keeps the runner going on a staff
/// Mac and shows the Portal in its own window. Everything lives in the
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
