import AppKit

enum MenuBarIcon {
    /// The Warehaus logomark (Figma Logo, Type=Mark, 159:833): five rounded
    /// bars, alternately raised and lowered. Drawn as a template image so it
    /// follows the menu bar's light and dark appearance, and matches the app
    /// icon (apps/mac/App/AppIcon.svg).
    static let image: NSImage = {
        // The mark is 67.2 x 28 in Figma. Scale it to 22pt wide.
        let scale: CGFloat = 22 / 67.2
        let size = NSSize(width: 22, height: (28 * scale).rounded(.up))
        let barWidth = 12.096 * scale
        let barHeight = 21.28 * scale
        let radius = 3.92 * scale
        let drop = 6.72 * scale
        let step = 13.776 * scale
        let image = NSImage(size: size, flipped: true) { rect in
            NSColor.black.setFill()
            let top = (rect.height - 28 * scale) / 2
            for index in 0..<5 {
                let y = top + (index.isMultiple(of: 2) ? 0 : drop)
                let bar = NSRect(x: CGFloat(index) * step, y: y, width: barWidth, height: barHeight)
                NSBezierPath(roundedRect: bar, xRadius: radius, yRadius: radius).fill()
            }
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Warehaus runner"
        return image
    }()
}
