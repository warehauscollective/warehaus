import Foundation
@testable import RunnerSupervisor

final class FakeProcess: RunnerProcess {
    var onLine: ((String) -> Void)?
    var onExit: ((Int32) -> Void)?
    var started = false
    var terminated = false
    var sent: [String] = []

    func start() throws { started = true }
    func send(_ command: String) { sent.append(command) }
    func terminate() { terminated = true }

    /// One state line from the runner, as the real one prints it.
    func emit(_ json: String) { onLine?("\(RunnerEvent.prefix)\(json)") }
    func exit(_ code: Int32) { onExit?(code) }
}

final class FakeProcesses: RunnerProcessMaking {
    var made: [(arguments: [String], process: FakeProcess)] = []
    var ran: [[String]] = []
    var removeExitCode: Int32 = 0

    var last: FakeProcess? { made.last?.process }

    func make(_ installation: RunnerInstallation, arguments: [String]) -> RunnerProcess {
        let process = FakeProcess()
        made.append((arguments, process))
        return process
    }

    func run(_ installation: RunnerInstallation, arguments: [String]) async -> Int32 {
        ran.append(arguments)
        return removeExitCode
    }
}

struct FixedPairing: PairingReading {
    var pairing: Pairing?
    func read() -> Pairing? { pairing }
}

struct FixedLocator: RunnerLocating {
    var installation: RunnerInstallation?
    func locate() -> RunnerInstallation? { installation }

    static let found = FixedLocator(installation: RunnerInstallation(
        node: URL(fileURLWithPath: "/usr/bin/true"),
        cli: URL(fileURLWithPath: "/tmp/cli.mjs"),
        workingDirectory: URL(fileURLWithPath: "/tmp"),
        path: []
    ))
}

final class MemoryPauseStore: PauseStoring {
    var paused = false
}

let productionPairing = Pairing(runnerId: "peter-mbp-prod", agentURL: "https://unique-turtle-383.convex.site")
let devPairing = Pairing(runnerId: "peter-mbp", agentURL: "https://graceful-mastiff-960.convex.site")
