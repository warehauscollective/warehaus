import RunnerMenu
import SwiftUI

/// Warehaus Runner: the menu bar app that keeps the runner going on a staff
/// Mac. Everything lives in the RunnerMenu and RunnerSupervisor modules in
/// apps/mac/Sources; this target only signs, bundles and launches them.
@main
struct WarehausRunnerApp: App {
    @StateObject private var model = RunnerAppModel.live()

    var body: some Scene {
        RunnerScenes(model: model)
    }
}
