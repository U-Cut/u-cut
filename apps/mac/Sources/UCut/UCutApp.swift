import SwiftUI

@main
struct UCutApp: App {
    var body: some Scene {
        WindowGroup("U-Cut") {
            ContentView()
        }
        .defaultSize(width: 720, height: 480)
    }
}

struct ContentView: View {
    var body: some View {
        VStack(spacing: 8) {
            Text("U-Cut")
                .font(.largeTitle.bold())
            Text("Your reels will start here.")
                .foregroundStyle(.secondary)
        }
        .frame(minWidth: 480, minHeight: 320)
    }
}
