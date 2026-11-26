import Foundation

// First launch (Figma, Mac runner app: checklist and pairing windows).
// Three steps in order: GitHub, Claude Code, Pair with the Portal. Each one
// opens the browser, and nothing installs without a click. This file only
// turns facts into rows; RunnerMenu runs the commands and draws the window.

/// What the app knows about GitHub through the bundled `gh`.
public enum GitHubFact: Equatable, Sendable {
    case checking
    case signedOut
    /// `gh auth login --web` is waiting for the person to enter this code.
    case signingIn(code: String?)
    case signedIn(login: String)
    case failed(String)
}

/// What the app knows about Claude Code on this Mac.
public enum ClaudeFact: Equatable, Sendable {
    case checking
    case missing
    case installing
    case signedOut
    case signingIn
    case signedIn(email: String?)
    case failed(String)
}

/// Where pairing stands.
public enum PairFact: Equatable, Sendable {
    case notPaired
    /// A pairing from `npm run runner -- setup` with its Keychain secret. The app adopts it.
    case adopted(runnerId: String)
    case pairing(PairingCode)
    case paired(runnerId: String)
    case expired
    case failed(String)
}

/// The code the runner printed, from its `pairing` line.
public struct PairingCode: Equatable, Sendable {
    public var code: String
    public var runnerId: String
    public var expiresAt: Date

    public init(code: String, runnerId: String, expiresAt: Date) {
        self.code = code
        self.runnerId = runnerId
        self.expiresAt = expiresAt
    }

    /// "9:41" left, never below 0:00.
    public func remaining(now: Date) -> String {
        let seconds = max(0, Int(expiresAt.timeIntervalSince(now).rounded(.down)))
        return "\(seconds / 60):" + String(format: "%02d", seconds % 60)
    }
}

/// Everything the checklist is drawn from.
public struct SetupFacts: Equatable, Sendable {
    public var github: GitHubFact
    public var claude: ClaudeFact
    public var pair: PairFact
    /// The old launchd agent from `npm run runner -- install` is still on this Mac.
    public var oldAgent: OldAgentFact

    public init(github: GitHubFact = .checking, claude: ClaudeFact = .checking, pair: PairFact = .notPaired, oldAgent: OldAgentFact = .none) {
        self.github = github
        self.claude = claude
        self.pair = pair
        self.oldAgent = oldAgent
    }
}

public enum OldAgentFact: Equatable, Sendable {
    case none
    /// Present, and this build will replace it when the person clicks.
    case present(label: String)
    /// Present, but this is a debug build, which never touches it.
    case leftAlone(label: String)
    case replacing(label: String)
    case failed(label: String, message: String)
}

public enum ChecklistStep: String, CaseIterable, Sendable {
    case github, claude, pair

    public var title: String {
        switch self {
        case .github: return "GitHub"
        case .claude: return "Claude Code"
        case .pair: return "Pair with the Portal"
        }
    }
}

public enum ChecklistAction: Equatable, Sendable {
    case signInToGitHub
    case installClaude
    case signInToClaude
    case pair
    case replaceOldAgent
    case retry(ChecklistStep)
}

public enum RowStatus: Equatable, Sendable {
    case done
    /// A spinner: the app is checking or a command is running.
    case working
    /// A button. Disabled until the steps before it are done.
    case button(String, ChecklistAction, enabled: Bool)
    case problem(String, ChecklistAction)
}

public struct ChecklistRow: Equatable, Sendable {
    public var step: ChecklistStep
    public var detail: String
    public var status: RowStatus

    public init(step: ChecklistStep, detail: String, status: RowStatus) {
        self.step = step
        self.detail = detail
        self.status = status
    }
}

/// The notice above the footer when the old agent is still installed.
public struct OldAgentNotice: Equatable, Sendable {
    public var text: String
    public var action: ChecklistAction?
    public var working: Bool
}

public struct ChecklistState: Equatable, Sendable {
    public static let heading = "Set up this Mac as a runner"
    public static let subtitle = "Three steps. Each one opens your browser; nothing installs without a click."
    public static let releaseFooter = "Production only · starts at login · Apple silicon, macOS 14 or later"
    public static let debugFooter = "Debug build · shared dev · never touches the production runner"

    public var rows: [ChecklistRow]
    public var notice: OldAgentNotice?
    public var footer: String
    /// Every step is done and the old agent is gone: the app may start its runner.
    public var complete: Bool

    public static func from(_ facts: SetupFacts, policy: DeploymentPolicy) -> ChecklistState {
        let github = githubRow(facts.github)
        let claude = claudeRow(facts.claude)
        let toolsReady = github.status == .done && claude.status == .done
        let pair = pairRow(facts.pair, unlocked: toolsReady)
        let notice = oldAgentNotice(facts.oldAgent)
        let agentClear: Bool
        switch facts.oldAgent {
        case .none, .leftAlone: agentClear = true
        default: agentClear = false
        }
        return ChecklistState(
            rows: [github, claude, pair],
            notice: notice,
            footer: policy.production ? releaseFooter : debugFooter,
            complete: toolsReady && pair.status == .done && agentClear
        )
    }

    static func githubRow(_ fact: GitHubFact) -> ChecklistRow {
        switch fact {
        case .checking:
            return ChecklistRow(step: .github, detail: "Checking…", status: .working)
        case .signedOut:
            return ChecklistRow(step: .github, detail: "Not signed in. Builds push to GitHub as you.", status: .button("Sign in", .signInToGitHub, enabled: true))
        case let .signingIn(code):
            let detail = code.map { "Enter \($0) in your browser to finish." } ?? "Opening GitHub in your browser…"
            return ChecklistRow(step: .github, detail: detail, status: .working)
        case let .signedIn(login):
            return ChecklistRow(step: .github, detail: "Signed in as \(login)", status: .done)
        case let .failed(message):
            return ChecklistRow(step: .github, detail: message, status: .problem("Try again", .signInToGitHub))
        }
    }

    static func claudeRow(_ fact: ClaudeFact) -> ChecklistRow {
        switch fact {
        case .checking:
            return ChecklistRow(step: .claude, detail: "Checking…", status: .working)
        case .missing:
            return ChecklistRow(step: .claude, detail: "Not installed yet. Installs the official CLI and signs in.", status: .button("Install", .installClaude, enabled: true))
        case .installing:
            return ChecklistRow(step: .claude, detail: "Installing the official CLI…", status: .working)
        case .signedOut:
            return ChecklistRow(step: .claude, detail: "Installed. Sign in through your browser.", status: .button("Sign in", .signInToClaude, enabled: true))
        case .signingIn:
            return ChecklistRow(step: .claude, detail: "Finish signing in in your browser.", status: .working)
        case let .signedIn(email):
            return ChecklistRow(step: .claude, detail: email.map { "Signed in as \($0)" } ?? "Signed in", status: .done)
        case let .failed(message):
            return ChecklistRow(step: .claude, detail: message, status: .problem("Try again", .retry(.claude)))
        }
    }

    static func pairRow(_ fact: PairFact, unlocked: Bool) -> ChecklistRow {
        switch fact {
        case let .adopted(id):
            return ChecklistRow(step: .pair, detail: "Already paired as \(id). This app takes it over.", status: .done)
        case let .paired(id):
            return ChecklistRow(step: .pair, detail: "Paired as \(id)", status: .done)
        case .pairing:
            return ChecklistRow(step: .pair, detail: "Waiting for you to confirm in the Portal…", status: .working)
        case .notPaired where !unlocked:
            return ChecklistRow(step: .pair, detail: "After Claude Code. You confirm this Mac in the Portal.", status: .button("Pair", .pair, enabled: false))
        case .notPaired:
            return ChecklistRow(step: .pair, detail: "You confirm this Mac in the Portal.", status: .button("Pair", .pair, enabled: true))
        case .expired:
            return ChecklistRow(step: .pair, detail: "The code expired before it was confirmed.", status: .problem("Pair again", .pair))
        case let .failed(message):
            return ChecklistRow(step: .pair, detail: message, status: .problem("Try again", .pair))
        }
    }

    static func oldAgentNotice(_ fact: OldAgentFact) -> OldAgentNotice? {
        switch fact {
        case .none:
            return nil
        case let .present(label):
            return OldAgentNotice(
                text: "The runner you installed from the terminal (\(label)) still starts at login. This app replaces it: it stops that agent, removes it, and runs the runner itself.",
                action: .replaceOldAgent,
                working: false
            )
        case let .leftAlone(label):
            return OldAgentNotice(text: "Debug build: \(label) is left alone.", action: nil, working: false)
        case let .replacing(label):
            return OldAgentNotice(text: "Stopping and removing \(label)…", action: nil, working: true)
        case let .failed(label, message):
            return OldAgentNotice(text: "\(label) couldn't be removed: \(message)", action: .replaceOldAgent, working: false)
        }
    }
}

// MARK: - Taking over a pairing from the terminal runner

/// What first launch does with what `npm run runner -- setup` and `install` left.
public struct Takeover: Equatable, Sendable {
    /// The pairing to adopt, when its file, its Keychain secret and this build's deployment all agree.
    public var adopt: Pairing?
    public var oldAgent: OldAgentFact

    public init(adopt: Pairing?, oldAgent: OldAgentFact) {
        self.adopt = adopt
        self.oldAgent = oldAgent
    }

    /// - pairing: the config file for this build's deployment (runner.prod.env in release).
    /// - hasSecret: the `warehaus-runner` Keychain item exists for it (checked without reading it).
    /// - agentInstalled: ~/Library/LaunchAgents/<policy.launchAgentLabel>.plist exists.
    public static func decide(policy: DeploymentPolicy, pairing: Pairing?, hasSecret: Bool, agentInstalled: Bool) -> Takeover {
        var adopt: Pairing?
        if let pairing, hasSecret, policy.allows(agentURL: pairing.agentURL) { adopt = pairing }
        let label = policy.launchAgentLabel
        let agent: OldAgentFact
        if !agentInstalled {
            agent = .none
        } else if policy.production {
            agent = .present(label: label)
        } else {
            agent = .leftAlone(label: label)
        }
        return Takeover(adopt: adopt, oldAgent: agent)
    }
}

extension DeploymentPolicy {
    /// The Convex deployment the runner's Keychain account is named after.
    public var deploymentName: String { production ? Self.productionDeployment : Self.devDeployment }

    /// `security -a` for this runner (tools/runner/src/lib.mjs, `keychainAccount`).
    public func keychainAccount(runnerId: String) -> String { "\(deploymentName):\(runnerId)" }

    /// The terminal runner's launchd label (tools/runner/src/lib.mjs, `launchAgentLabel`).
    public var launchAgentLabel: String { production ? "co.warehaus.runner.prod" : "co.warehaus.runner" }

    /// `setup --supervised`, which prints the code for the app.
    public var setupArguments: [String] {
        production ? ["setup", "--supervised", "--production"] : ["setup", "--supervised"]
    }

    /// The Portal page that confirms a pairing code in one click (PR 185):
    /// `/?runnerPair=CODE` on the Portal origin.
    public func pairingURL(code: String) -> URL {
        var components = URLComponents(url: portalURL, resolvingAgainstBaseURL: false)!
        components.path = "/"
        components.queryItems = [URLQueryItem(name: "runnerPair", value: code.uppercased())]
        return components.url!
    }
}

// MARK: - Reading command output

public enum SetupOutput {
    /// The account from `gh auth status --hostname github.com`, or nil when signed out.
    /// gh prints "✓ Logged in to github.com account octocat (keyring)".
    public static func githubLogin(fromStatus output: String) -> String? {
        for line in output.split(whereSeparator: \.isNewline) {
            guard let range = line.range(of: "Logged in to github.com account ") else { continue }
            let rest = line[range.upperBound...]
            let login = rest.split(separator: " ").first.map(String.init) ?? ""
            if !login.isEmpty { return login }
        }
        // Older gh: "Logged in to github.com as octocat".
        for line in output.split(whereSeparator: \.isNewline) {
            guard let range = line.range(of: "Logged in to github.com as ") else { continue }
            if let login = line[range.upperBound...].split(separator: " ").first { return String(login) }
        }
        return nil
    }

    /// The one-time code from `gh auth login --web`: "! First copy your one-time code: 1A2B-3C4D".
    public static func githubDeviceCode(in output: String) -> String? {
        guard let range = output.range(of: "one-time code: ") else { return nil }
        let code = output[range.upperBound...].prefix(while: { $0.isLetter || $0.isNumber || $0 == "-" })
        return code.count >= 8 ? String(code) : nil
    }

    /// `claude auth status --json`. Nil when it isn't the JSON we expect.
    public static func claude(fromStatus json: String) -> ClaudeFact? {
        struct Status: Decodable { var loggedIn: Bool; var email: String? }
        guard let status = try? JSONDecoder().decode(Status.self, from: Data(json.utf8)) else { return nil }
        return status.loggedIn ? .signedIn(email: status.email) : .signedOut
    }
}

/// One line from `setup --supervised`.
public enum PairingEvent: Equatable, Sendable {
    case pairing(PairingCode)
    case paired(runnerId: String)
    case expired

    public static func parse(line: String) -> PairingEvent? {
        guard line.hasPrefix(RunnerEvent.prefix) else { return nil }
        struct Raw: Decodable { var type: String; var code: String?; var runnerId: String?; var expiresAt: Double? }
        guard let raw = try? JSONDecoder().decode(Raw.self, from: Data(line.dropFirst(RunnerEvent.prefix.count).utf8)) else { return nil }
        switch raw.type {
        case "pairing":
            guard let code = raw.code, !code.isEmpty, let id = raw.runnerId, let expires = raw.expiresAt else { return nil }
            return .pairing(PairingCode(code: code, runnerId: id, expiresAt: Date(timeIntervalSince1970: expires / 1000)))
        case "paired":
            guard let id = raw.runnerId, !id.isEmpty else { return nil }
            return .paired(runnerId: id)
        case "pair_expired":
            return .expired
        default:
            return nil
        }
    }
}
