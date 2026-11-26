import AppKit
import RunnerSupervisor
import SwiftUI

/// The Remove this runner confirm dialog (Figma: "Remove this runner · confirm").
public struct RemoveRunnerView: View {
    @ObservedObject var model: RunnerAppModel
    @Environment(\.dismissWindow) private var dismissWindow

    public init(model: RunnerAppModel) {
        self.model = model
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Remove this runner?")
                .font(.system(size: 18, weight: .semibold))
            Text("\(model.runnerId ?? "This runner") is revoked in the Portal, removed from login items, and its secret is deleted from this Mac’s Keychain. A run in progress is handed back for Retry.")
                .font(.system(size: 13))
                .fixedSize(horizontal: false, vertical: true)
            if let message = model.removeMessage {
                Text(message)
                    .font(.system(size: 12))
                    .foregroundStyle(Color(nsColor: .systemRed))
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                Button("Cancel") { dismissWindow(id: RunnerScenes.removeWindowID) }
                    .keyboardShortcut(.cancelAction)
                    .controlSize(.large)
                Button {
                    Task {
                        if await model.remove() { dismissWindow(id: RunnerScenes.removeWindowID) }
                    }
                } label: {
                    Text(model.removing ? "Removing…" : "Remove runner")
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(nsColor: .systemRed))
                .controlSize(.large)
                .disabled(model.removing)
            }
        }
        .padding(24)
        .frame(width: 440, alignment: .leading)
    }
}
