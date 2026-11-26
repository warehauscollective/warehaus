#if DEBUG
import AppKit
import UserNotifications
import WebKit

/// Debug-only checks for a localhost preview, so the window can be checked
/// and captured with no screen recording permission.
///
/// - `-PortalWindowSize 1024x768` sizes the window.
/// - `-PortalAppearance dark|light` forces the appearance (the Portal's
///   Auto theme follows it).
/// - `-AttentionFixture needs-you|ready-to-ship|both|clear` has the page post
///   fixture `attention` messages through the real bridge handler: an empty
///   one first (the launch seed), then the fixture two seconds later, so the
///   badge and banners can be checked before the attention feed exists.
/// - `-PortalWindowSnapshot <folder>` writes `portal-<width>-<appearance>.png`
///   (the page plus the window buttons, composited; no window shadow) and
///   `shell-state.json` a few seconds after the page loads.
extension PortalWindowController {
    func applyDebugArguments(to window: NSWindow) {
        let defaults = UserDefaults.standard
        if let size = defaults.string(forKey: "PortalWindowSize")?.split(separator: "x").compactMap({ Double($0) }), size.count == 2 {
            window.setContentSize(NSSize(width: max(size[0], Self.minimumSize.width), height: max(size[1], Self.minimumSize.height)))
            window.center()
        }
        switch defaults.string(forKey: "PortalAppearance") {
        case "dark": window.appearance = NSAppearance(named: .darkAqua)
        case "light": window.appearance = NSAppearance(named: .aqua)
        default: break
        }
    }

    func injectAttentionFixtureIfAsked() {
        guard let name = UserDefaults.standard.string(forKey: "AttentionFixture"), let webView,
              let fixture = Self.attentionFixture(named: name, stamp: Int(Date().timeIntervalSince1970))
        else { return }
        let post = { (message: [String: Any]) in
            webView.evaluateJavaScript("window.webkit.messageHandlers.warehaus.postMessage(\(ShellScript.json(message)));")
        }
        post(["type": "attention", "count": 0, "alerts": [[String: Any]]()])
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { post(fixture) }
    }

    /// Fixture attention messages. Ids carry the launch time so each run notifies.
    nonisolated static func attentionFixture(named name: String, stamp: Int) -> [String: Any]? {
        let now = Double(stamp) * 1000
        let needsYou: [String: Any] = [
            "id": "fixture-ask-\(stamp)", "kind": "ask", "title": "Runner on production",
            "url": "warehaus://milestone/m-launch?project=p-site", "createdAt": now,
        ]
        let ready: [String: Any] = [
            "id": "fixture-ready-\(stamp)", "kind": "readyToShip", "title": "Mac app: Portal window",
            "url": "warehaus://milestone/m-launch?project=p-site", "createdAt": now,
        ]
        let alerts: [[String: Any]]
        switch name {
        case "needs-you": alerts = [needsYou]
        case "ready-to-ship": alerts = [ready]
        case "both": alerts = [needsYou, ready]
        case "clear": alerts = []
        default: return nil
        }
        return ["type": "attention", "count": name == "both" ? 2 : alerts.count, "alerts": alerts]
    }

    static let shellStateScript = "JSON.stringify({shell:document.documentElement.dataset.shell||null,hello:window.__warehausShellHello||null,inset:(function(){var c=document.querySelector('.portal-chrome');return c?getComputedStyle(c).paddingTop:null})(),theme:document.documentElement.classList.contains('light')?'light':'dark',path:location.pathname+location.search})"

    /// `log stream --predicate 'category == "PortalWindow"'` shows what the page made of the shell.
    func logShellState(_ webView: WKWebView) {
        webView.evaluateJavaScript(Self.shellStateScript) { [log] value, _ in
            log.notice("Page shell state: \(String(describing: value ?? "none"), privacy: .public)")
        }
    }

    func snapshotIfAsked() {
        guard let folder = UserDefaults.standard.string(forKey: "PortalWindowSnapshot") else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.snapshot(into: URL(fileURLWithPath: folder)) }
    }

    private func snapshot(into folder: URL) {
        guard let window, let webView else { return }
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let dark = window.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        let name = "portal-\(Int(window.frame.width))-\(dark ? "dark" : "light")"
        webView.evaluateJavaScript(Self.shellStateScript) { value, _ in
            try? ((value as? String) ?? "null").write(to: folder.appendingPathComponent("\(name)-shell-state.json"), atomically: true, encoding: .utf8)
        }
        let permission = String(describing: self.permission)
        let badge = NSApp.dockTile.badgeLabel ?? ""
        let nativeFile = folder.appendingPathComponent("\(name)-native.json")
        if Bundle.main.bundleIdentifier != nil {
            UNUserNotificationCenter.current().getDeliveredNotifications { notes in
                let delivered = notes.map { ["title": $0.request.content.title, "body": $0.request.content.body] }
                let state: [String: Any] = ["permission": permission, "badge": badge, "delivered": delivered]
                try? ShellScript.json(state).write(to: nativeFile, atomically: true, encoding: .utf8)
            }
        }
        webView.takeSnapshot(with: nil) { page, _ in
            MainActor.assumeIsolated {
                guard let page else { return }
                let size = window.frame.size
                let scale = window.backingScaleFactor
                guard let rep = NSBitmapImageRep(
                    bitmapDataPlanes: nil, pixelsWide: Int(size.width * scale), pixelsHigh: Int(size.height * scale),
                    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
                ) else { return }
                rep.size = size
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
                let webFrame = webView.convert(webView.bounds, to: nil)
                page.draw(in: webFrame)
                for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
                    guard let button = window.standardWindowButton(kind),
                          let cache = button.bitmapImageRepForCachingDisplay(in: button.bounds) else { continue }
                    button.cacheDisplay(in: button.bounds, to: cache)
                    cache.draw(in: button.convert(button.bounds, to: nil))
                }
                NSGraphicsContext.restoreGraphicsState()
                try? rep.representation(using: .png, properties: [:])?.write(to: folder.appendingPathComponent("\(name).png"))
            }
        }
    }
}
#endif
