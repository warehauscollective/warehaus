import AppKit
import Combine
import RunnerSupervisor
import SwiftUI

/// Shows the checklist and the pairing window. AppKit windows, so the model
/// can open them on first launch and from the menu without a SwiftUI scene.
@MainActor
public final class SetupWindows: SetUpFlow {
    public let model: SetupModel
    private var checklistWindow: NSWindow?
    private var pairingWindow: NSWindow?
    private var bag = Set<AnyCancellable>()

    public init(model: SetupModel) {
        self.model = model
        // Never inside the SwiftUI update that creates the model: a window
        // built there trips AttributeGraph.
        model.$showsPairing
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] shows in
                if shows { self?.showPairing() } else { self?.closePairing() }
            }
            .store(in: &bag)
    }

    public func showChecklist() {
        if checklistWindow == nil {
            checklistWindow = Self.window(SetupChecklistView(model: model))
        }
        NSApp.activate(ignoringOtherApps: true)
        checklistWindow?.makeKeyAndOrderFront(nil)
        Task { await model.check() }
    }

    public func closeChecklist() {
        checklistWindow?.close()
        checklistWindow = nil
    }

    // MARK: SetUpFlow (menu rows)

    public func pair() {
        showChecklist()
        model.perform(.pair)
    }

    public func signInToGitHub() {
        showChecklist()
        model.perform(.signInToGitHub)
    }

    // MARK: Pairing window

    private func showPairing() {
        if pairingWindow == nil {
            pairingWindow = Self.window(PairingView(model: model) { [weak self] in self?.closePairing() })
        }
        NSApp.activate(ignoringOtherApps: true)
        pairingWindow?.makeKeyAndOrderFront(nil)
    }

    private func closePairing() {
        pairingWindow?.close()
        pairingWindow = nil
    }

    static func window<Content: View>(_ view: Content) -> NSWindow {
        let window = NSWindow(contentViewController: NSHostingController(rootView: view))
        window.title = "Warehaus runner"
        window.styleMask = [.titled, .closable]
        window.isReleasedWhenClosed = false
        window.center()
        return window
    }
}
