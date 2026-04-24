import SwiftUI

/// Direction 2 — Editorial Dusk.
/// Ink on stone, confident magazine typography.
/// Dark-first; light variant keeps the same tokens but lifts the paper.
struct DuskTheme: LineaTheme {
    let id: LineaThemeID = .dusk

    let palette = LineaPalette(
        paper: Color(
            light: Color(red: 0.918, green: 0.906, blue: 0.882),
            dark:  Color(red: 0.086, green: 0.086, blue: 0.094)       // near-black
        ),
        paperDim: Color(
            light: Color(red: 0.882, green: 0.867, blue: 0.839),
            dark:  Color(red: 0.118, green: 0.118, blue: 0.129)
        ),
        lift: Color(
            light: Color(red: 0.953, green: 0.945, blue: 0.925),
            dark:  Color(red: 0.161, green: 0.157, blue: 0.165)
        ),
        ink: Color(
            light: Color(red: 0.086, green: 0.086, blue: 0.094),
            dark:  Color(red: 0.937, green: 0.925, blue: 0.894)
        ),
        inkSoft: Color(
            light: Color(red: 0.286, green: 0.278, blue: 0.282),
            dark:  Color(red: 0.722, green: 0.694, blue: 0.643)
        ),
        inkMuted: Color(
            light: Color(red: 0.490, green: 0.471, blue: 0.447),
            dark:  Color(red: 0.510, green: 0.494, blue: 0.459)
        ),
        rule: Color(
            light: Color(red: 0.086, green: 0.086, blue: 0.094, opacity: 0.12),
            dark:  Color(red: 0.937, green: 0.925, blue: 0.894, opacity: 0.12)
        ),
        ruleStrong: Color(
            light: Color(red: 0.086, green: 0.086, blue: 0.094, opacity: 0.20),
            dark:  Color(red: 0.937, green: 0.925, blue: 0.894, opacity: 0.20)
        ),
        accent: Color(
            light: Color(red: 0.780, green: 0.369, blue: 0.204),      // burnt orange
            dark:  Color(red: 0.918, green: 0.557, blue: 0.341)
        ),
        highlight: Color(
            light: Color(red: 0.086, green: 0.086, blue: 0.094, opacity: 0.08),
            dark:  Color(red: 0.918, green: 0.557, blue: 0.341, opacity: 0.18)
        )
    )

    let typography = LineaTypography(
        display: LineaFont(family: .editorialSerif, defaultSize: 32, defaultWeight: .semibold, italic: false),
        serif:   LineaFont(family: .editorialSerif, defaultSize: 17, defaultWeight: .regular,  italic: false),
        ui:      LineaFont(family: .systemSans,     defaultSize: 13, defaultWeight: .medium,   italic: false),
        mono:    LineaFont(family: .systemMono,     defaultSize: 12, defaultWeight: .regular,  italic: false)
    )

    let radii = LineaRadii(
        sharp: 2, sm: 4, md: 8, lg: 12, xl: 16, pill: 999
    )

    let preferredColorScheme: ColorScheme? = .dark
}
