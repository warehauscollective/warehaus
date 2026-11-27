import Foundation
import NativeBridge

/// The JavaScript that delivers a shell message to the page: a
/// `warehaus:shell` CustomEvent whose `detail` is the message
/// (shellBoot.ts and ShellProvider.tsx listen for it).
public enum ShellScript {
    public static func dispatch(_ message: ShellMessage) -> String {
        let detail = json(message.jsonObject())
        let name = json(NativeBridge.eventName)
        return "window.dispatchEvent(new CustomEvent(\(name),{detail:\(detail)}));"
    }

    /// The hello this app sends after every page load, and again when
    /// notification permission changes. Capabilities come from
    /// `NotificationPermission.capabilities`: only what the window handles now.
    public static func hello(appVersion: String, permission: NotificationPermission) -> ShellMessage {
        .hello(appVersion: appVersion, capabilities: permission.capabilities)
    }

    /// The app version for the hello. The page refuses a hello whose version
    /// is not like 1.4.0, so anything else is sent as 0.0.0.
    public static func appVersion(_ shortVersion: String?) -> String {
        guard let version = shortVersion,
              version.range(of: #"^\d{1,3}\.\d{1,3}\.\d{1,4}$"#, options: .regularExpression) != nil
        else { return "0.0.0" }
        return version
    }

    /// JSON is valid JavaScript, so encoding is all the escaping a value needs.
    static func json(_ value: Any) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .fragmentsAllowed])) ?? Data("null".utf8)
        return String(decoding: data, as: UTF8.self)
    }
}

/// What the window does with a message the page posted to `warehaus`.
public enum PageAction: Equatable, Sendable {
    /// Open this https link in the default browser.
    case openExternal(URL)
    /// The open count for the Dock badge and the alerts to consider notifying.
    case attention(count: Int, alerts: [AttentionAlert])
    /// Dropped. The reason is logged.
    case refuse(String)

    public static func from(_ body: Any) -> PageAction {
        switch BridgeDecoder.decodePageMessage(body) {
        case let .success(.openExternal(url)): return .openExternal(url)
        case let .success(.attention(count, alerts)): return .attention(count: count, alerts: alerts)
        case let .failure(refusal): return .refuse(refusal.reason)
        }
    }
}

/// A raw warehaus:// link from the system, passed on unparsed (ADR-0006, decision 7).
public enum PortalLink {
    /// The link, or nil when it is not a warehaus:// link. Only the scheme is read.
    public static func accept(_ text: String) -> String? {
        guard let scheme = URL(string: text)?.scheme, scheme.lowercased() == NativeBridge.portalLinkScheme else { return nil }
        return text
    }
}
