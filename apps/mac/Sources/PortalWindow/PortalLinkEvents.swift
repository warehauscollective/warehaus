import AppKit

/// Receives warehaus:// links opened anywhere on the Mac (Info.plist
/// CFBundleURLTypes) and passes the raw text on. Install it before the app
/// finishes launching so a link that launched the app is not lost.
@MainActor
public final class PortalLinkEvents: NSObject {
    public static let shared = PortalLinkEvents()

    private var handler: ((String) -> Void)?

    public func install(_ handler: @escaping (String) -> Void) {
        self.handler = handler
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handle(_:reply:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    @objc private func handle(_ event: NSAppleEventDescriptor, reply: NSAppleEventDescriptor) {
        guard let text = event.paramDescriptor(forKeyword: AEKeyword(keyDirectObject))?.stringValue else { return }
        handler?(text)
    }
}
