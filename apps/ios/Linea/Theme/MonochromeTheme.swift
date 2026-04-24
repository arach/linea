import SwiftUI

/// Direction 3 — Quiet Monochrome.
/// Near-white paper, modern literary serif, minimal chrome.
/// Colours resolve against system appearance so the same tokens serve
/// both light and dark reading modes.
struct MonochromeTheme: LineaTheme {
    let id: LineaThemeID = .monochrome

    let palette = LineaPalette(
        paper: Color(
            light: Color(red: 0.984, green: 0.980, blue: 0.969),      // #fbfaf7
            dark:  Color(red: 0.070, green: 0.068, blue: 0.063)       // deep ink
        ),
        paperDim: Color(
            light: Color(red: 0.949, green: 0.941, blue: 0.917),      // #f2f0ea
            dark:  Color(red: 0.101, green: 0.098, blue: 0.090)
        ),
        lift: Color(
            light: .white,
            dark:  Color(red: 0.125, green: 0.121, blue: 0.113)
        ),
        ink: Color(
            light: Color(red: 0.102, green: 0.102, blue: 0.090),      // #1a1a17
            dark:  Color(red: 0.961, green: 0.953, blue: 0.933)
        ),
        inkSoft: Color(
            light: Color(red: 0.333, green: 0.325, blue: 0.302),      // #55534d
            dark:  Color(red: 0.706, green: 0.686, blue: 0.647)
        ),
        inkMuted: Color(
            light: Color(red: 0.592, green: 0.576, blue: 0.541),      // #97938a
            dark:  Color(red: 0.498, green: 0.478, blue: 0.439)
        ),
        rule: Color(
            light: Color(red: 0.102, green: 0.102, blue: 0.090, opacity: 0.08),
            dark:  Color(red: 0.961, green: 0.953, blue: 0.933, opacity: 0.10)
        ),
        ruleStrong: Color(
            light: Color(red: 0.102, green: 0.102, blue: 0.090, opacity: 0.14),
            dark:  Color(red: 0.961, green: 0.953, blue: 0.933, opacity: 0.18)
        ),
        accent: Color(
            light: Color(red: 0.102, green: 0.102, blue: 0.090),
            dark:  Color(red: 0.961, green: 0.953, blue: 0.933)
        ),
        highlight: Color(
            light: Color(red: 0.102, green: 0.102, blue: 0.090, opacity: 0.05),
            dark:  Color(red: 0.961, green: 0.953, blue: 0.933, opacity: 0.08)
        )
    )

    let typography = LineaTypography(
        display: LineaFont(family: .editorialSerif, defaultSize: 30, defaultWeight: .regular, italic: false),
        serif:   LineaFont(family: .editorialSerif, defaultSize: 17, defaultWeight: .regular, italic: false),
        ui:      LineaFont(family: .systemSans,     defaultSize: 13, defaultWeight: .regular, italic: false),
        mono:    LineaFont(family: .systemMono,     defaultSize: 12, defaultWeight: .regular, italic: false)
    )

    let radii = LineaRadii(
        sharp: 2, sm: 4, md: 10, lg: 14, xl: 18, pill: 999
    )
}
