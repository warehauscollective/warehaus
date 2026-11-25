import Foundation

/// The Swift copy of `packages/native-bridge/index.mjs`. Same four messages,
/// same rules, checked against the same `fixtures/messages.json`.
public enum NativeBridge {
    /// Bump only with a matching TypeScript change.
    public static let bridgeVersion = 1
    public static let portalLinkScheme = "warehaus"
    public static let maxAlerts = 20
}

public enum ShellCapability: String, Codable, CaseIterable, Sendable {
    case badge
    case notify
    case openExternal
}

public enum AlertKind: String, Codable, Sendable {
    case ask
    case readyToShip
}

public struct AttentionAlert: Codable, Equatable, Sendable {
    public let id: String
    public let kind: AlertKind
    public let title: String
    /// A warehaus:// link. Hand it back to the page with `navigate`; never parse it here.
    public let url: String
    public let createdAt: Double
}

/// Messages the shell sends to the page.
public enum ShellMessage: Equatable, Sendable {
    case hello(appVersion: String, capabilities: [ShellCapability])
    case navigate(url: String)

    /// The JSON object to post into the page.
    public func jsonObject() -> [String: Any] {
        switch self {
        case let .hello(appVersion, capabilities):
            return [
                "type": "shell.hello",
                "bridgeVersion": NativeBridge.bridgeVersion,
                "platform": "macos",
                "appVersion": appVersion,
                "capabilities": capabilities.map(\.rawValue),
            ]
        case let .navigate(url):
            return ["type": "navigate", "url": url]
        }
    }
}

/// Messages the page sends to the shell.
public enum PageMessage: Equatable, Sendable {
    case attention(count: Int, alerts: [AttentionAlert])
    case openExternal(url: URL)
}

public struct BridgeRefusal: Error, Equatable, Sendable {
    public let reason: String
}

public enum BridgeDecoder {
    /// Reads a message the page posted. Anything off is refused with one plain reason.
    public static func decodePageMessage(_ value: Any) -> Result<PageMessage, BridgeRefusal> {
        guard let m = value as? [String: Any] else { return refuse("message must be an object") }
        switch m["type"] as? String {
        case "attention": return decodeAttention(m)
        case "openExternal": return decodeOpenExternal(m)
        case "shell.hello", "navigate":
            return refuse("\(m["type"]!) is not a page to shell message")
        default: return refuse("unknown message type")
        }
    }

    /// Reads a shell message back. The app only sends these; tests use it to
    /// prove the Swift copy refuses what the TypeScript copy refuses.
    public static func decodeShellMessage(_ value: Any) -> Result<ShellMessage, BridgeRefusal> {
        guard let m = value as? [String: Any] else { return refuse("message must be an object") }
        switch m["type"] as? String {
        case "shell.hello": return decodeHello(m)
        case "navigate":
            guard let url = m["url"] as? String, isPortalLink(url) else { return refuse("url must be a warehaus:// link") }
            return .success(.navigate(url: url))
        case "attention", "openExternal":
            return refuse("\(m["type"]!) is not a shell to page message")
        default: return refuse("unknown message type")
        }
    }

    private static func decodeHello(_ m: [String: Any]) -> Result<ShellMessage, BridgeRefusal> {
        guard let version = wholeNumber(m["bridgeVersion"]), version == NativeBridge.bridgeVersion else {
            return refuse("bridgeVersion must be \(NativeBridge.bridgeVersion)")
        }
        guard m["platform"] as? String == "macos" else { return refuse("platform must be macos") }
        guard let appVersion = m["appVersion"] as? String,
              appVersion.range(of: #"^\d{1,3}\.\d{1,3}\.\d{1,4}$"#, options: .regularExpression) != nil
        else { return refuse("appVersion must look like 1.4.0") }
        guard let raw = m["capabilities"] as? [Any] else { return refuse("capabilities must be a list") }
        var capabilities: [ShellCapability] = []
        for item in raw {
            guard let name = item as? String, let capability = ShellCapability(rawValue: name) else {
                return refuse("capabilities must be from badge, notify, openExternal")
            }
            if !capabilities.contains(capability) { capabilities.append(capability) }
        }
        return .success(.hello(appVersion: appVersion, capabilities: capabilities))
    }

    private static func decodeAttention(_ m: [String: Any]) -> Result<PageMessage, BridgeRefusal> {
        guard let count = wholeNumber(m["count"]), count >= 0 else { return refuse("count must be a whole number from 0") }
        guard let raw = m["alerts"] as? [Any], raw.count <= NativeBridge.maxAlerts else {
            return refuse("alerts must be a list of at most \(NativeBridge.maxAlerts)")
        }
        var alerts: [AttentionAlert] = []
        for item in raw {
            guard let a = item as? [String: Any],
                  let id = a["id"] as? String, !id.trimmingCharacters(in: .whitespaces).isEmpty,
                  let title = a["title"] as? String, !title.trimmingCharacters(in: .whitespaces).isEmpty,
                  let kindName = a["kind"] as? String, let kind = AlertKind(rawValue: kindName),
                  let url = a["url"] as? String, isPortalLink(url),
                  let createdAt = number(a["createdAt"])
            else { return refuse("each alert needs an id, a known kind, a title, a warehaus:// url and createdAt") }
            alerts.append(AttentionAlert(id: id, kind: kind, title: title, url: url, createdAt: createdAt))
        }
        return .success(.attention(count: count, alerts: alerts))
    }

    private static func decodeOpenExternal(_ m: [String: Any]) -> Result<PageMessage, BridgeRefusal> {
        guard let text = m["url"] as? String, let url = URL(string: text), url.scheme == "https", url.host != nil else {
            return refuse("url must be an https link")
        }
        return .success(.openExternal(url: url))
    }

    private static func isPortalLink(_ text: String) -> Bool {
        URL(string: text)?.scheme == NativeBridge.portalLinkScheme
    }

    /// JSON numbers arrive as NSNumber; booleans are NSNumber too, so refuse them.
    private static func number(_ value: Any?) -> Double? {
        guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
        let d = n.doubleValue
        return d.isFinite ? d : nil
    }

    private static func wholeNumber(_ value: Any?) -> Int? {
        guard let d = number(value), d.rounded() == d, abs(d) < Double(Int.max) else { return nil }
        return Int(d)
    }

    private static func refuse<T>(_ reason: String) -> Result<T, BridgeRefusal> {
        .failure(BridgeRefusal(reason: reason))
    }
}
