import AppKit

enum MenuBarIcon {
    /// The "W" in a rounded square from the design, as a template image so it
    /// follows the menu bar's light and dark appearance.
    static let image: NSImage = {
        let size = NSSize(width: 18, height: 14)
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor.black.setFill()
            NSBezierPath(roundedRect: rect, xRadius: 3, yRadius: 3).fill()
            let attributes: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 10, weight: .heavy),
                .foregroundColor: NSColor.black,
            ]
            let letter = NSAttributedString(string: "W", attributes: attributes)
            let bounds = letter.size()
            let origin = NSPoint(x: (rect.width - bounds.width) / 2, y: (rect.height - bounds.height) / 2)
            NSGraphicsContext.current?.compositingOperation = .destinationOut
            letter.draw(at: origin)
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Warehaus runner"
        return image
    }()
}
