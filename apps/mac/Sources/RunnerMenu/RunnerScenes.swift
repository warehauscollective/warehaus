import SwiftUI

/// The menu bar app's scenes: the dropdown and the Remove confirm window.
/// The app target's @main body is just `RunnerScenes(model:)`.
public struct RunnerScenes: Scene {
    public static let removeWindowID = "remove-runner"

    @ObservedObject var model: RunnerAppModel

    public init(model: RunnerAppModel) {
        self.model = model
    }

    public var body: some Scene {
        MenuBarExtra {
            RunnerMenuView(model: model)
        } label: {
            Image(nsImage: MenuBarIcon.image)
        }
        .menuBarExtraStyle(.window)

        Window("Warehaus runner", id: Self.removeWindowID) {
            RemoveRunnerView(model: model)
        }
        .windowResizability(.contentSize)
        .windowStyle(.titleBar)
        .defaultPosition(.center)
    }
}
