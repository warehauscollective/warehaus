import AppKit
import RunnerSupervisor
import SwiftUI

/// The first-launch checklist (Figma: Mac runner app, checklist, Dark and Light).
public struct SetupChecklistView: View {
    @ObservedObject var model: SetupModel

    public init(model: SetupModel) {
        self.model = model
    }

    public var body: some View {
        let state = model.checklist
        VStack(alignment: .leading, spacing: 0) {
            Text(ChecklistState.heading)
                .font(.system(size: 20, weight: .semibold))
                .padding(.bottom, 14)
            Text(ChecklistState.subtitle)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .padding(.bottom, 16)
            VStack(spacing: 8) {
                ForEach(state.rows, id: \.step) { row in
                    ChecklistRowView(row: row) { model.perform($0) }
                }
            }
            if let notice = state.notice {
                NoticeView(notice: notice) { model.perform($0) }
                    .padding(.top, 8)
            }
            Text(state.footer)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.tertiary)
                .padding(.top, 16)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 20)
        .frame(width: 520, alignment: .leading)
    }
}

struct ChecklistRowView: View {
    let row: ChecklistRow
    let perform: (ChecklistAction) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            indicator
                .frame(width: 20, height: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.step.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(locked ? .secondary : .primary)
                Text(row.detail)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: 270, alignment: .leading)
            }
            Spacer(minLength: 12)
            trailing
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(SetupColors.card))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(SetupColors.cardBorder))
    }

    private var locked: Bool {
        if case .button(_, _, enabled: false) = row.status { return true }
        return false
    }

    @ViewBuilder private var indicator: some View {
        switch row.status {
        case .done:
            Image(systemName: "checkmark.circle.fill")
                .resizable()
                .symbolRenderingMode(.palette)
                .foregroundStyle(.white, Color(nsColor: .systemGreen))
        case .working:
            ProgressView().controlSize(.small)
        case .problem:
            Image(systemName: "exclamationmark.circle.fill")
                .resizable()
                .foregroundStyle(Color(nsColor: .systemOrange))
        case .button:
            Circle()
                .strokeBorder(locked ? Color.secondary.opacity(0.5) : Color.primary, lineWidth: 1.5)
        }
    }

    @ViewBuilder private var trailing: some View {
        switch row.status {
        case let .button(title, action, enabled):
            if enabled {
                Button(title) { perform(action) }.buttonStyle(PrimaryButtonStyle())
            } else {
                Button(title) {}.buttonStyle(SecondaryButtonStyle()).disabled(true)
            }
        case let .problem(title, action):
            Button(title) { perform(action) }.buttonStyle(SecondaryButtonStyle())
        case .done, .working:
            EmptyView()
        }
    }
}

struct NoticeView: View {
    let notice: OldAgentNotice
    let perform: (ChecklistAction) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if notice.working {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: "info.circle").foregroundStyle(.secondary)
            }
            Text(notice.text)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if let action = notice.action {
                Button("Replace it") { perform(action) }.buttonStyle(SecondaryButtonStyle())
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 8).strokeBorder(SetupColors.cardBorder, style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
    }
}

/// The pairing window (Figma: Mac runner app, pairing, Dark and Light).
public struct PairingView: View {
    @ObservedObject var model: SetupModel
    let close: () -> Void

    public init(model: SetupModel, close: @escaping () -> Void) {
        self.model = model
        self.close = close
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Confirm this Mac in the Portal")
                .font(.system(size: 20, weight: .semibold))
                .padding(.bottom, 14)
            Text("We opened the Portal in your browser with this code filled in. Check it matches, then click Confirm and pair.")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 16)
            VStack(spacing: 8) {
                Text("PAIRING CODE")
                    .font(.system(size: 11, design: .monospaced))
                    .tracking(0.5)
                    .foregroundStyle(.tertiary)
                Text(model.pairingCode?.code ?? "")
                    .font(.system(size: 34, weight: .regular, design: .monospaced))
                    .textSelection(.enabled)
                if let code = model.pairingCode {
                    Text("Runner id: \(code.runnerId) · expires in \(code.remaining(now: model.now))")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 20)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 8).fill(SetupColors.card))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(SetupColors.cardBorder))
            HStack(spacing: 8) {
                Circle().fill(Color(red: 0.62, green: 0.29, blue: 0.08)).frame(width: 8, height: 8)
                Text("Waiting for confirmation…")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 18)
            HStack(spacing: 8) {
                Button("Cancel") {
                    model.cancelPairing()
                    close()
                }
                .buttonStyle(SecondaryButtonStyle())
                .keyboardShortcut(.cancelAction)
                Button("Open Portal again") { model.openPortalForPairing() }
                    .buttonStyle(PrimaryButtonStyle())
            }
            .padding(.top, 18)
        }
        .padding(.horizontal, 24)
        .padding(.top, 16)
        .padding(.bottom, 24)
        .frame(width: 520, alignment: .leading)
    }
}

// MARK: - Styles from the design

enum SetupColors {
    static let primaryFill = Color(nsColor: NSColor(name: nil) { $0.isDark ? .white : .black })
    static let primaryText = Color(nsColor: NSColor(name: nil) { $0.isDark ? .black : .white })
    static let card = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.isDark ? NSColor(white: 1, alpha: 0.05) : NSColor(white: 0, alpha: 0.03)
    })
    static let cardBorder = Color(nsColor: NSColor(name: nil) { appearance in
        appearance.isDark ? NSColor(white: 1, alpha: 0.10) : NSColor(white: 0, alpha: 0.12)
    })
}

extension NSAppearance {
    var isDark: Bool { bestMatch(from: [.darkAqua, .aqua]) == .darkAqua }
}

/// White on dark, black on light, as in the design.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(SetupColors.primaryText)
            .padding(.horizontal, 12)
            .frame(height: 28)
            .background(RoundedRectangle(cornerRadius: 6).fill(SetupColors.primaryFill.opacity(configuration.isPressed ? 0.8 : 1)))
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(enabled ? Color.primary : Color.secondary)
            .padding(.horizontal, 12)
            .frame(height: 28)
            .background(RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(configuration.isPressed ? 0.08 : 0)))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(SetupColors.cardBorder))
    }
}
