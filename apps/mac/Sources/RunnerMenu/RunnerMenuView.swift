import AppKit
import RunnerSupervisor
import SwiftUI

/// The menu bar dropdown (Figma: Mac runner app, node 1115-38617). A window-
/// style MenuBarExtra, 300 wide: a header with the status, then menu rows.
public struct RunnerMenuView: View {
    @ObservedObject var model: RunnerAppModel
    @Environment(\.openWindow) private var openWindow

    public init(model: RunnerAppModel) {
        self.model = model
    }

    public var body: some View {
        let menu = model.menu
        VStack(alignment: .leading, spacing: 0) {
            MenuHeader(menu: menu)
            MenuDivider()
            ForEach(Array(menu.primary.enumerated()), id: \.offset) { _, item in
                MenuRow(item.title) { model.perform(item.action) }
            }
            MenuDivider()
            if let pause = menu.secondaryPause {
                MenuRow(pause.title) { model.perform(pause.action) }
            }
            if menu.showsUpdateLine {
                updateRows(waitsForRun: menu.updateWaitsForRun)
            }
            MenuRow("Start at login", trailing: model.loginItemOn ? "On" : "Off") { model.toggleLoginItem() }
            MenuDivider()
            MenuRow("Remove this runner…", role: .destructive) {
                model.clearRemoveMessage()
                openWindow(id: RunnerScenes.removeWindowID)
                NSApp.activate(ignoringOtherApps: true)
            }
            MenuRow("Quit", trailing: "⌘Q") { model.quit() }
                .keyboardShortcut("q")
        }
        .padding(7)
        .frame(width: 300)
    }

    /// The update line, then Check for update (design iteration 2, AppUpdate.swift).
    @ViewBuilder
    private func updateRows(waitsForRun: Bool) -> some View {
        let line = model.updateLine
        MenuRow(line.title, trailing: line.trailing, enabled: false) {}
        if line.offersCheck { MenuRow("Check for update") { model.checkForUpdate() } }
    }
}

struct MenuHeader: View {
    let menu: MenuState

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Warehaus runner")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                Circle().fill(dotColor).frame(width: 8, height: 8)
                Text(menu.status.rawValue).font(.system(size: 14, weight: .semibold))
            }
            ForEach(Array(menu.lines.enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var dotColor: Color {
        switch menu.status {
        case .ready, .working: return Color(nsColor: .systemGreen)
        case .paused: return Color(nsColor: .systemOrange)
        case .needsAttention: return Color(nsColor: .systemRed)
        }
    }
}

struct MenuDivider: View {
    var body: some View {
        Rectangle()
            .fill(Color.primary.opacity(0.1))
            .frame(height: 1)
            .padding(.vertical, 1)
    }
}

/// One row, 27 high, highlighted on hover like a native menu item.
struct MenuRow: View {
    enum Role { case normal, destructive }

    let title: String
    var trailing: String?
    var role: Role
    var enabled: Bool
    let action: () -> Void
    @State private var hovering = false

    init(_ title: String, trailing: String? = nil, role: Role = .normal, enabled: Bool = true, action: @escaping () -> Void) {
        self.title = title
        self.trailing = trailing
        self.role = role
        self.enabled = enabled
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title).foregroundStyle(titleColor)
                Spacer(minLength: 8)
                if let trailing {
                    Text(trailing).font(.system(size: 12)).foregroundStyle(hovering && enabled ? Color.white.opacity(0.8) : .secondary)
                }
            }
            .font(.system(size: 13))
            .padding(.horizontal, 10)
            .frame(height: 27)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 5)
                    .fill(hovering && enabled ? Color.accentColor : .clear)
            )
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .onHover { hovering = $0 }
    }

    private var titleColor: Color {
        if !enabled { return .secondary }
        if hovering { return .white }
        return role == .destructive ? Color(nsColor: .systemRed) : .primary
    }
}
