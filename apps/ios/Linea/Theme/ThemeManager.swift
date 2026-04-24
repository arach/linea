import SwiftUI

@MainActor
final class ThemeManager: ObservableObject {
    @Published private(set) var theme: LineaTheme

    init(initial: LineaThemeID = .monochrome) {
        self.theme = LineaThemeRegistry.theme(for: initial)
    }

    func apply(_ id: LineaThemeID) {
        guard id != theme.id else { return }
        theme = LineaThemeRegistry.theme(for: id)
    }
}

// MARK: - SwiftUI environment

private struct LineaThemeKey: EnvironmentKey {
    static let defaultValue: LineaTheme = MonochromeTheme()
}

extension EnvironmentValues {
    var lineaTheme: LineaTheme {
        get { self[LineaThemeKey.self] }
        set { self[LineaThemeKey.self] = newValue }
    }
}

extension View {
    /// Inject the active theme into the environment. Apply this once at the app root
    /// so every child view can read `@Environment(\.lineaTheme)`.
    func lineaTheme(_ theme: LineaTheme) -> some View {
        environment(\.lineaTheme, theme)
    }
}
