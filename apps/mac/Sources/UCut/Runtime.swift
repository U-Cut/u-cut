import Foundation

/// How to start the engine: which program, with what, from where.
struct EngineCommand: Sendable {
    let executable: URL
    let arguments: [String]
    let directory: URL
    let environment: [String: String]
}

/// The downloadable app carries Node, FFmpeg, the speech tool, the photo sorter and the engine in
/// Contents/Resources/runtime. On first launch, and after an update, it copies them into
/// ~/Library/Application Support/U-Cut, runs them from there, and keeps a `ucut` command beside
/// them for assistants. A build made from the source code runs the engine from the checkout.
enum Runtime {
    struct Info: Decodable {
        let version: String
        let build: String
    }

    enum Problem: LocalizedError {
        case notInstalled
        case copyFailed(String)

        var errorDescription: String? {
            switch self {
            case .notInstalled:
                "U-Cut's engine isn't installed. Download U-Cut again from its releases page, or run the installer from the README."
            case .copyFailed(let reason):
                "U-Cut couldn't set itself up in Application Support: \(reason) Check there's free disk space, then open it again."
            }
        }
    }

    /// UCUT_SUPPORT moves it, for tests.
    static let support =
        ProcessInfo.processInfo.environment["UCUT_SUPPORT"].map { URL(fileURLWithPath: $0) }
        ?? FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/U-Cut")
    /// Stays at the same place across updates, so an assistant's settings keep working.
    static let launcher = support.appendingPathComponent("bin/ucut")

    private static var bundled: URL? {
        guard let resources = Bundle.main.resourceURL else { return nil }
        let runtime = resources.appendingPathComponent("runtime")
        return FileManager.default.fileExists(atPath: runtime.appendingPathComponent("runtime.json").path)
            ? runtime : nil
    }

    /// True when this launch has to copy the engine first, which takes a few seconds.
    static var needsCopy: Bool {
        guard let bundled, let info = read(bundled) else { return false }
        return !isInstalled(folder(for: info))
    }

    /// Gets the engine ready and says how to start it. Runs off the main thread.
    static func prepare(port: Int) throws -> EngineCommand {
        let serve = ["serve", "--no-open", "--json", "--port", String(port), "--exit-with-parent"]
        guard let bundled, let info = read(bundled) else {
            return try sourceCheckout(serve: serve)
        }
        let installed = folder(for: info)
        if !isInstalled(installed) { try copy(bundled, to: installed) }
        try writeLauncher(for: installed)
        removeOldVersions(keeping: installed)
        return EngineCommand(
            executable: installed.appendingPathComponent("bin/node"),
            arguments: [installed.appendingPathComponent("engine/packages/engine/dist/bin.js").path] + serve,
            directory: installed.appendingPathComponent("engine"),
            environment: ["UCUT_LAUNCHER": launcher.path]
        )
    }

    private static func read(_ runtime: URL) -> Info? {
        guard let data = try? Data(contentsOf: runtime.appendingPathComponent("runtime.json")) else { return nil }
        return try? JSONDecoder().decode(Info.self, from: data)
    }

    private static func folder(for info: Info) -> URL {
        support.appendingPathComponent("runtime/\(info.version)-\(info.build)")
    }

    private static func isInstalled(_ folder: URL) -> Bool {
        FileManager.default.fileExists(atPath: folder.appendingPathComponent("runtime.json").path)
    }

    /// Copies into a side folder first, so a copy cut short is never mistaken for a finished one.
    private static func copy(_ source: URL, to target: URL) throws {
        let manager = FileManager.default
        let partial = target.appendingPathExtension("partial")
        do {
            try manager.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? manager.removeItem(at: partial)
            // APFS clones the files when the app sits on the same disk, so this is nearly instant.
            try manager.copyItem(at: source, to: partial)
            // The copy inherits the download's quarantine flag from the app, which you've already
            // approved by opening it. Without this, macOS would ask again about each tool inside.
            run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", partial.path])
            try? manager.removeItem(at: target)
            try manager.moveItem(at: partial, to: target)
        } catch {
            try? manager.removeItem(at: partial)
            throw Problem.copyFailed(error.localizedDescription)
        }
    }

    private static func writeLauncher(for installed: URL) throws {
        let node = installed.appendingPathComponent("bin/node").path
        let engine = installed.appendingPathComponent("engine/packages/engine/dist/bin.js").path
        let script = """
            #!/bin/sh
            # Written by U-Cut.app each time it opens, so it always runs the app's current engine.
            export UCUT_LAUNCHER="\(launcher.path)"
            exec "\(node)" "\(engine)" "$@"

            """
        let manager = FileManager.default
        try manager.createDirectory(at: launcher.deletingLastPathComponent(), withIntermediateDirectories: true)
        if (try? String(contentsOf: launcher, encoding: .utf8)) != script {
            try script.write(to: launcher, atomically: true, encoding: .utf8)
        }
        try manager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: launcher.path)
    }

    /// Only the version in use is kept. Your reels live elsewhere, in ~/Movies/U-Cut.
    private static func removeOldVersions(keeping installed: URL) {
        let manager = FileManager.default
        let parent = installed.deletingLastPathComponent()
        let names = (try? manager.contentsOfDirectory(atPath: parent.path)) ?? []
        for name in names where name != installed.lastPathComponent {
            try? manager.removeItem(at: parent.appendingPathComponent(name))
        }
    }

    @discardableResult
    private static func run(_ tool: String, _ arguments: [String]) -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        guard (try? process.run()) != nil else { return -1 }
        process.waitUntilExit()
        return process.terminationStatus
    }

    /// A build from the source code: the engine runs from the checkout with the Node on the PATH.
    private static func sourceCheckout(serve: [String]) throws -> EngineCommand {
        let manager = FileManager.default
        let candidates: [String?] = [
            ProcessInfo.processInfo.environment["UCUT_ROOT"],
            Bundle.main.object(forInfoDictionaryKey: "UCutRoot") as? String,
            manager.homeDirectoryForCurrentUser.appendingPathComponent(".u-cut").path,
        ]
        guard
            let root = candidates.compactMap({ $0 })
                .first(where: { manager.fileExists(atPath: "\($0)/packages/engine/dist/bin.js") })
        else { throw Problem.notInstalled }
        // Homebrew isn't on the PATH of apps opened from Finder.
        let path = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin"
        return EngineCommand(
            executable: URL(fileURLWithPath: "/usr/bin/env"),
            arguments: ["node", "packages/engine/dist/bin.js"] + serve,
            directory: URL(fileURLWithPath: root),
            environment: ["PATH": "/opt/homebrew/bin:/usr/local/bin:\(path)"]
        )
    }
}
