import Foundation

/// Runs the U-Cut engine for the life of the app and reports the address of its interface.
@MainActor
final class Engine: ObservableObject {
    enum State {
        case starting
        /// The first launch after installing or updating, while the engine is copied into place.
        case preparing
        case running(URL)
        case failed(String)
    }

    @Published private(set) var state: State = .starting
    private var process: Process?
    /// Held open for the life of the app. If the app dies, the engine sees this close and stops.
    private let lifeline = Pipe()
    private var started = false
    /// UCUT_PORT changes it, for tests that run beside a U-Cut already open.
    private let port = Int(ProcessInfo.processInfo.environment["UCUT_PORT"] ?? "") ?? 4173

    /// Safe to call more than once: macOS can restore several windows, and each one asks.
    func start() {
        guard !started else { return }
        started = true
        Task {
            // U-Cut may already be running in the browser. Share it instead of starting another.
            if let url = URL(string: "http://localhost:\(port)"),
                let status = url.appending(path: "api/status") as URL?,
                let (_, response) = try? await URLSession.shared.data(from: status),
                (response as? HTTPURLResponse)?.statusCode == 200
            {
                state = .running(url)
            } else {
                launch()
            }
        }
    }

    private func launch() {
        if Runtime.needsCopy { state = .preparing }
        let port = port
        Task.detached {
            let prepared = Result { try Runtime.prepare(port: port) }
            await MainActor.run { [weak self] in
                switch prepared {
                case .success(let command): self?.run(command)
                case .failure(let error): self?.state = .failed(error.localizedDescription)
                }
            }
        }
    }

    private func run(_ command: EngineCommand) {
        let process = Process()
        let output = Pipe()
        process.executableURL = command.executable
        process.arguments = command.arguments
        process.currentDirectoryURL = command.directory
        process.standardOutput = output
        process.standardInput = lifeline
        process.environment = ProcessInfo.processInfo.environment.merging(command.environment) { $1 }
        if let log = Self.openLog() { process.standardError = log }
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            guard let line = String(data: handle.availableData, encoding: .utf8),
                let data = line.data(using: .utf8),
                let reply = try? JSONDecoder().decode(Reply.self, from: data),
                let url = URL(string: reply.url)
            else { return }
            handle.readabilityHandler = nil
            Task { @MainActor in self?.state = .running(url) }
        }
        process.terminationHandler = { [weak self] finished in
            let code = finished.terminationStatus
            Task { @MainActor in
                self?.state = .failed("U-Cut's engine stopped (code \(code)). Open the app again. If it keeps happening, the reason is in ~/Library/Logs/U-Cut/engine.log.")
            }
        }
        do {
            try process.run()
            self.process = process
        } catch {
            state = .failed("Couldn't start the engine: \(error.localizedDescription)")
        }
    }

    func stop() {
        process?.terminate()
    }

    /// Starts a fresh log each launch, so a failure can be diagnosed.
    private static func openLog() -> FileHandle? {
        let manager = FileManager.default
        let folder = manager.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/U-Cut")
        let file = folder.appendingPathComponent("engine.log")
        try? manager.createDirectory(at: folder, withIntermediateDirectories: true)
        guard manager.createFile(atPath: file.path, contents: nil) else { return nil }
        return try? FileHandle(forWritingTo: file)
    }

    private struct Reply: Decodable {
        let url: String
    }
}
