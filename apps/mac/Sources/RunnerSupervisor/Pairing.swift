import Foundation

/// The pairing `npm run runner -- setup` saved: the Convex site URL and the
/// runner id. The secret stays in the Keychain; the runner reads it itself,
/// so the app never holds it.
public struct Pairing: Equatable, Sendable {
    public var runnerId: String
    public var agentURL: String

    public init(runnerId: String, agentURL: String) {
        self.runnerId = runnerId
        self.agentURL = agentURL
    }

    /// Parses the KEY=value file (tools/runner/src/lib.mjs, `configFileText`).
    public static func parse(_ text: String) -> Pairing? {
        var values: [String: String] = [:]
        for raw in text.split(whereSeparator: \.isNewline) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty, !line.hasPrefix("#"), let equals = line.firstIndex(of: "=") else { continue }
            let key = line[..<equals].trimmingCharacters(in: .whitespaces)
            var value = line[line.index(after: equals)...].trimmingCharacters(in: .whitespaces)
            if value.count >= 2, value.first == "\"", value.last == "\"" { value = String(value.dropFirst().dropLast()) }
            values[key] = value
        }
        guard let id = values["RUNNER_ID"], !id.isEmpty, let url = values["PORTAL_AGENT_URL"], !url.isEmpty else { return nil }
        return Pairing(runnerId: id, agentURL: url)
    }
}

public protocol PairingReading: Sendable {
    func read() -> Pairing?
}

/// Reads ~/.config/warehaus/runner.prod.env (runner.env in debug builds).
public struct PairingFile: PairingReading {
    public let url: URL

    public init(policy: DeploymentPolicy, home: URL = FileManager.default.homeDirectoryForCurrentUser) {
        url = home.appendingPathComponent(".config/warehaus/\(policy.configFileName)")
    }

    public func read() -> Pairing? {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return Pairing.parse(text)
    }
}
