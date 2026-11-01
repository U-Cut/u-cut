import SwiftUI

@main
struct UCutApp: App {
    @NSApplicationDelegateAdaptor private var delegate: AppDelegate
    @StateObject private var engine = Engine()

    var body: some Scene {
        WindowGroup("U-Cut") {
            ContentView(engine: engine)
                .frame(minWidth: 960, minHeight: 640)
                .background(.black)
                .preferredColorScheme(.dark)
                .onAppear {
                    engine.start()
                    delegate.engine = engine
                }
        }
        .defaultSize(width: 1280, height: 820)
        .windowStyle(.hiddenTitleBar)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    var engine: Engine?

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        engine?.stop()
    }
}

struct ContentView: View {
    @ObservedObject var engine: Engine
    @State private var splashTimeUp = false

    private var isStarting: Bool {
        if case .starting = engine.state { return true }
        return false
    }

    var body: some View {
        ZStack {
            content
            if isStarting || !splashTimeUp {
                SplashView().transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.4), value: isStarting || !splashTimeUp)
        .task {
            try? await Task.sleep(for: .seconds(1.9))
            splashTimeUp = true
        }
    }

    @ViewBuilder private var content: some View {
        switch engine.state {
        case .starting:
            Color.black
        case .running(let url):
            // The page skips its own splash, since this app has just shown one.
            WebView(url: url.appending(queryItems: [URLQueryItem(name: "shell", value: "1")]))
                .ignoresSafeArea()
        case .failed(let reason):
            VStack(spacing: 10) {
                Text("U-Cut can't start.")
                    .font(.largeTitle.bold())
                Text(reason)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
