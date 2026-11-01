import SwiftUI

/// One half of U-Cut's scissors, drawn on the same 128 by 120 grid as the web version.
private struct ScissorsHalf: Shape {
    let isUpper: Bool

    func path(in rect: CGRect) -> Path {
        let flip = { (y: CGFloat) in isUpper ? y : 120 - y }
        var ring = Path()
        ring.addEllipse(in: CGRect(x: 7, y: flip(87) - 14, width: 28, height: 28))
        ring.move(to: CGPoint(x: 34, y: flip(77)))
        ring.addLine(to: CGPoint(x: 60, y: flip(60)))
        var shape = ring.strokedPath(StrokeStyle(lineWidth: 13, lineCap: .round))
        var blade = Path()
        blade.move(to: CGPoint(x: 44, y: flip(72)))
        blade.addLine(to: CGPoint(x: 126, y: flip(32)))
        blade.addLine(to: CGPoint(x: 70, y: flip(46)))
        blade.closeSubpath()
        shape.addPath(blade)
        return shape.applying(CGAffineTransform(scaleX: rect.width / 128, y: rect.height / 120))
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
                }
                .frame(width: 170, height: 159)
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
