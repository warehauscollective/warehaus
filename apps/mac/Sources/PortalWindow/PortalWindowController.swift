import AppKit
import NativeBridge
import OSLog
import WebKit

/// The Portal in one window: a WKWebView under a transparent 40px title bar
/// strip (Figma, Projects / Mac app, 1440 and 1024 frames). It is the Mac
/// adapter of the native bridge. It knows nothing about the runner.
@MainActor
public final class PortalWindowController: NSObject {
    public static let titleBarHeight: CGFloat = 40
    public static let minimumSize = NSSize(width: 1024, height: 768)
    public static let defaultSize = NSSize(width: 1440, height: 900)

    /// The app's one Portal window.
    public static let shared = PortalWindowController(
        origins: PortalOrigins.current(),
        appVersion: ShellScript.appVersion(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String)
    )

    let origins: PortalOrigins?
    let appVersion: String
    private let openInBrowser: (URL) -> Void
    let log = Logger(subsystem: "co.warehaus.runner.app", category: "PortalWindow")

    private(set) var window: NSWindow?
    private(set) var webView: WKWebView?
    private var bridge: BridgeProxy?
    /// True once the current page finished loading and got its hello.
    private var pageReady = false
    /// warehaus:// links that arrived before the page was ready.
    private var pendingLinks: [String] = []

    public init(origins: PortalOrigins?, appVersion: String, openInBrowser: @escaping (URL) -> Void = { NSWorkspace.shared.open($0) }) {
        self.origins = origins
        self.appVersion = appVersion
        self.openInBrowser = openInBrowser
    }

    /// Shows the window, building it and loading the Portal the first time.
    public func show() {
        if window == nil { build() }
        NSApp.setActivationPolicy(.regular)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    /// Shows the window and hands `link` (a raw warehaus:// link) to the page.
    /// Swift never reads the route; the Portal resolves it.
    public func open(portalLink link: String) {
        guard let link = PortalLink.accept(link) else {
            log.notice("Refused a link that is not warehaus://")
            return
        }
        show()
        if pageReady {
            send(.navigate(url: link))
        } else {
            pendingLinks.append(link)
        }
    }

    // MARK: - Window

    private func build() {
        let window = NSWindow(
            contentRect: NSRect(origin: .zero, size: Self.defaultSize),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Warehaus Portal"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        // A compact toolbar makes the title bar about 40px tall, so the window
        // buttons sit in the middle of the strip the Portal leaves empty.
        let toolbar = NSToolbar(identifier: "PortalWindow")
        toolbar.showsBaselineSeparator = false
        window.toolbar = toolbar
        window.toolbarStyle = .unifiedCompact
        window.contentMinSize = Self.minimumSize
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("PortalWindow")
        #if DEBUG
        applyDebugArguments(to: window)
        #endif

        let content = NSView()
        let webView = makeWebView()
        let strip = DragStripView()
        for view in [webView, strip] as [NSView] {
            view.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(view)
        }
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: content.topAnchor),
            webView.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            strip.topAnchor.constraint(equalTo: content.topAnchor),
            strip.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            strip.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            strip.heightAnchor.constraint(equalToConstant: Self.titleBarHeight),
        ])
        window.contentView = content
        self.window = window
        self.webView = webView
        loadHome()
    }

    private func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let proxy = BridgeProxy(owner: self)
        configuration.userContentController.add(proxy, name: NativeBridge.handlerName)
        bridge = proxy
        if origins?.flavor == .debug {
            configuration.userContentController.addUserScript(
                WKUserScript(source: ConvexGuard.userScript, injectionTime: .atDocumentStart, forMainFrameOnly: false)
            )
        }
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        #if DEBUG
        webView.isInspectable = true
        #endif
        return webView
    }

    private func loadHome() {
        guard let webView else { return }
        guard let origins else {
            showRefusal("This debug build only opens a localhost Portal. Launch it with -PortalURL http://localhost:<port>/projects.")
            return
        }
        guard origins.flavor == .debug else {
            webView.load(URLRequest(url: origins.home))
            return
        }
        // Debug: block production Convex before the first request, or load nothing.
        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: ConvexGuard.ruleListIdentifier,
            encodedContentRuleList: ConvexGuard.contentRules
        ) { [weak self] list, error in
            MainActor.assumeIsolated {
                guard let self, let webView = self.webView else { return }
                guard let list else {
                    self.log.error("Convex guard did not compile: \(error?.localizedDescription ?? "unknown", privacy: .public)")
                    self.showRefusal(ConvexGuard.refusal)
                    return
                }
                webView.configuration.userContentController.add(list)
                webView.load(URLRequest(url: origins.home))
            }
        }
    }

    private func showRefusal(_ message: String) {
        let text = message
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
        webView?.loadHTMLString(
            "<body style=\"font:14px -apple-system;padding:64px 32px;color-scheme:light dark\">\(text)</body>",
            baseURL: nil
        )
    }

    // MARK: - Bridge

    private func send(_ message: ShellMessage) {
        webView?.evaluateJavaScript(ShellScript.dispatch(message)) { [log] _, error in
            if let error { log.error("Shell message failed: \(error.localizedDescription, privacy: .public)") }
        }
    }

    fileprivate func received(_ message: WKScriptMessage) {
        // Only the Portal's own main frame may talk to the shell.
        guard message.frameInfo.isMainFrame, let origins, let url = message.frameInfo.request.url, origins.isPortal(url) else {
            log.notice("Dropped a bridge message from outside the Portal")
            return
        }
        switch PageAction.from(message.body) {
        case let .openExternal(url): openInBrowser(url)
        case .ignore: break
        case let .refuse(reason): log.notice("Refused a page message: \(reason, privacy: .public)")
        }
    }
}

// MARK: - Navigation

extension PortalWindowController: WKNavigationDelegate {
    public func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let origins else {
            decisionHandler(action.request.url?.scheme == "about" ? .allow : .cancel)
            return
        }
        let isMainFrame = action.targetFrame?.isMainFrame ?? true
        switch LinkRouter.decide(url, isMainFrame: isMainFrame, origins: origins) {
        case .allow:
            decisionHandler(.allow)
        case let .openInBrowser(url):
            decisionHandler(.cancel)
            openInBrowser(url)
        case let .forwardToPortal(link):
            decisionHandler(.cancel)
            open(portalLink: link)
        case .cancel:
            decisionHandler(.cancel)
        }
    }

    public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        pageReady = false
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url, origins?.isPortal(url) == true else { return }
        send(ShellScript.hello(appVersion: appVersion))
        pageReady = true
        let links = pendingLinks
        pendingLinks.removeAll()
        for link in links { send(.navigate(url: link)) }
        #if DEBUG
        logShellState(webView)
        snapshotIfAsked()
        #endif
    }


    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        log.error("Web content process ended; reloading the Portal")
        pageReady = false
        webView.reload()
    }
}

// MARK: - Page UI

extension PortalWindowController: WKUIDelegate {
    /// `target="_blank"` and `window.open`: Portal pages load here, everything else in the browser.
    public func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url, let origins else { return nil }
        switch LinkRouter.decide(url, isMainFrame: true, origins: origins) {
        case .allow: webView.load(action.request)
        case let .openInBrowser(url): openInBrowser(url)
        case let .forwardToPortal(link): open(portalLink: link)
        case .cancel: break
        }
        return nil
    }

    public func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
        completionHandler()
    }

    public func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    public func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        completionHandler(panel.runModal() == .OK ? panel.urls : nil)
    }
}

// MARK: - Window life

extension PortalWindowController: NSWindowDelegate {
    /// The window hides on close and keeps its page. The app goes back to a
    /// menu bar app with no Dock icon.
    public func windowWillClose(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }
}

/// WKUserContentController holds its handlers strongly; this keeps the window weak.
private final class BridgeProxy: NSObject, WKScriptMessageHandler {
    weak var owner: PortalWindowController?

    init(owner: PortalWindowController) {
        self.owner = owner
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        MainActor.assumeIsolated { owner?.received(message) }
    }
}

/// The 40px strip over the top of the page: drags the window, and a double
/// click zooms or minimizes as System Settings says.
final class DragStripView: NSView {
    override var mouseDownCanMoveWindow: Bool { true }

    override func mouseDown(with event: NSEvent) {
        guard let window else { return }
        if event.clickCount == 2 {
            switch UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") {
            case "Minimize": window.performMiniaturize(nil)
            case "None": break
            default: window.performZoom(nil)
            }
        } else {
            window.performDrag(with: event)
        }
    }
}
