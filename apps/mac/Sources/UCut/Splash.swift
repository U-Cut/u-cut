import SwiftUI

/// One half of U-Cut's scissors, drawn on the same 128 by 120 grid as the web version. The handle
/// and blade are painted separately, because merging them leaves holes where they overlap.
private struct ScissorsHalf: View {
    let isUpper: Bool

    var body: some View {
        Canvas { context, size in
            context.scaleBy(x: size.width / 128, y: size.height / 120)
            let flip = { (y: CGFloat) in isUpper ? y : 120 - y }
            var handle = Path()
            handle.addEllipse(in: CGRect(x: 7, y: flip(87) - 14, width: 28, height: 28))
            handle.move(to: CGPoint(x: 34, y: flip(77)))
            handle.addLine(to: CGPoint(x: 60, y: flip(60)))
            context.stroke(handle, with: .color(.white), style: StrokeStyle(lineWidth: 13, lineCap: .round))
            var blade = Path()
            blade.move(to: CGPoint(x: 44, y: flip(72)))
            blade.addLine(to: CGPoint(x: 126, y: flip(32)))
            blade.addLine(to: CGPoint(x: 70, y: flip(46)))
            blade.closeSubpath()
            context.fill(blade, with: .color(.white))
        }
    }
}

/// Shown from the moment the app opens, so it never sits on an empty window while the engine starts.
struct SplashView: View {
    @State private var angle = 0.0
    @State private var cutShown = false
    private let pivot = UnitPoint(x: 60.0 / 128.0, y: 0.5)

    var body: some View {
        ZStack {
            RadialGradient(
                colors: [
                    Color(red: 0.15, green: 0.07, blue: 0.42), Color(red: 0.08, green: 0.04, blue: 0.24),
                    Color(red: 0.03, green: 0.01, blue: 0.06), .black,
                ],
                center: .center, startRadius: 0, endRadius: 620)
            HStack(alignment: .center, spacing: 26) {
                Text("U")
                ZStack {
                    ScissorsHalf(isUpper: true).rotationEffect(.degrees(angle), anchor: pivot)
                    ScissorsHalf(isUpper: false).rotationEffect(.degrees(-angle), anchor: pivot)
                    Circle()
                        .fill(Color(red: 0.08, green: 0.04, blue: 0.24))
                        .frame(width: 14, height: 14)
                        .offset(x: -5.9)
                }
                .frame(width: 188, height: 176)
                Text("Cut")
                    .opacity(cutShown ? 1 : 0)
                    .offset(x: cutShown ? 0 : -40)
            }
            .font(.system(size: 196, weight: .heavy))
            .tracking(-4)
            .minimumScaleFactor(0.4)
            .foregroundStyle(.white)
            .padding(40)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 0.22).repeatCount(3, autoreverses: true).delay(0.3)) {
                angle = 11
            }
            withAnimation(.easeOut(duration: 0.5).delay(0.42)) { cutShown = true }
        }
    }
}
