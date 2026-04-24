import SwiftUI

struct SplashView: View {
    @Environment(\.lineaTheme) private var theme

    var body: some View {
        ZStack {
            theme.palette.paper.ignoresSafeArea()

            VStack(spacing: 24) {
                ThemedMonogram(title: "Linea", size: CGSize(width: 48, height: 62))

                Text("Linea")
                    .font(theme.typography.display.font(size: 40, weight: .regular, italic: true))
                    .foregroundStyle(theme.palette.ink)

                Text("Reading, listening, and asking")
                    .font(theme.typography.serif.font(size: 14, weight: .regular, italic: true))
                    .foregroundStyle(theme.palette.inkSoft)
            }
        }
    }
}
