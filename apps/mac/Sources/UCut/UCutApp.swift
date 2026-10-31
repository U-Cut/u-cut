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

    var body: some View {
        switch engine.state {
        case .starting:
            Color.black
        case .running(let url):
            WebView(url: url).ignoresSafeArea()
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
