import Foundation

/// The runner child process as the supervisor sees it. Tests use a fake.
/// Callbacks arrive on the main queue.
public protocol RunnerProcess: AnyObject {
    var onLine: ((String) -> Void)? { get set }
    var onExit: ((Int32) -> Void)? { get set }
    func start() throws
    /// Writes one line on the runner's stdin: `pause` or `resume`.
    func send(_ command: String)
    func terminate()
}

public protocol RunnerProcessMaking {
    func make(_ installation: RunnerInstallation, arguments: [String]) -> RunnerProcess
    /// Runs a one-off runner command (`remove`) and returns its exit code.
    func run(_ installation: RunnerInstallation, arguments: [String]) async -> Int32
}

/// `node tools/runner/src/cli.mjs …` through Foundation.Process.
public final class NodeRunnerProcess: RunnerProcess {
    public var onLine: ((String) -> Void)?
    public var onExit: ((Int32) -> Void)?

    private let process = Process()
    private let stdin = Pipe()
    private let stdout = Pipe()
    private var buffer = Data()

    public init(_ installation: RunnerInstallation, arguments: [String]) {
        process.executableURL = installation.node
        process.arguments = [installation.cli.path] + arguments
        process.currentDirectoryURL = installation.workingDirectory
        process.environment = NodeRunnerProcess.environment(path: installation.path)
        process.standardInput = stdin
        process.standardOutput = stdout
        process.standardError = stdout
    }

    /// A small environment: the runner reads its secret from the Keychain and
    /// passes Claude only an allowlist (tools/runner/src/lib.mjs, `childEnv`).
    static func environment(path: [String]) -> [String: String] {
        let parent = ProcessInfo.processInfo.environment
        var env: [String: String] = ["PATH": path.joined(separator: ":")]
        for key in ["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "SSH_AUTH_SOCK"] {
            if let value = parent[key] { env[key] = value }
        }
        return env
    }

    public func start() throws {
        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let chunk = handle.availableData
            DispatchQueue.main.async { self?.consume(chunk) }
        }
        process.terminationHandler = { [weak self] finished in
            let code = finished.terminationStatus
            DispatchQueue.main.async {
                guard let self else { return }
                self.stdout.fileHandleForReading.readabilityHandler = nil
                self.consume(self.stdout.fileHandleForReading.readDataToEndOfFile())
                self.onExit?(code)
            }
        }
        try process.run()
    }

    private func consume(_ chunk: Data) {
        guard !chunk.isEmpty else { return }
        buffer.append(chunk)
        while let newline = buffer.firstIndex(of: 0x0A) {
            let line = String(decoding: buffer[buffer.startIndex..<newline], as: UTF8.self)
            buffer.removeSubrange(buffer.startIndex...newline)
            onLine?(line)
        }
    }

    public func send(_ command: String) {
        guard process.isRunning else { return }
        try? stdin.fileHandleForWriting.write(contentsOf: Data("\(command)\n".utf8))
    }

    public func terminate() {
        guard process.isRunning else { return }
        process.terminate()
    }
}

public struct NodeRunnerProcesses: RunnerProcessMaking {
    public init() {}

    public func make(_ installation: RunnerInstallation, arguments: [String]) -> RunnerProcess {
        NodeRunnerProcess(installation, arguments: arguments)
    }

    public func run(_ installation: RunnerInstallation, arguments: [String]) async -> Int32 {
        await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = installation.node
            process.arguments = [installation.cli.path] + arguments
            process.currentDirectoryURL = installation.workingDirectory
            process.environment = NodeRunnerProcess.environment(path: installation.path)
            process.standardInput = FileHandle.nullDevice
            process.standardOutput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            process.terminationHandler = { continuation.resume(returning: $0.terminationStatus) }
            do {
                try process.run()
            } catch {
                continuation.resume(returning: 127)
            }
        }
    }
}
