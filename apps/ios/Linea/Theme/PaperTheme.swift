import SwiftUI

/// Direction 1 — Paper & Ink.
/// Warm cream, transitional serif, hand-annotated.
/// Minimal implementation — the token surface is the same as Monochrome so
/// every view that renders in Mono also renders coherently here. We tune
/// this direction up when we build out its handwritten marginalia pass.
struct PaperTheme: LineaTheme {
    let id: LineaThemeID = .paper

    let palette = LineaPalette(
        paper: Color(
            light: Color(red: 0.969, green: 0.945, blue: 0.894),      // warm cream
            dark:  Color(red: 0.110, green: 0.094, blue: 0.071)
        ),
        paperDim: Color(
            light: Color(red: 0.941, green: 0.914, blue: 0.855),
            dark:  Color(red: 0.145, green: 0.125, blue: 0.094)
        ),
        lift: Color(
            light: Color(red: 0.996, green: 0.984, blue: 0.949),
            dark:  Color(red: 0.165, green: 0.141, blue: 0.106)
        ),
        ink: Color(
            light: Color(red: 0.176, green: 0.137, blue: 0.102),      // warm dark brown
            dark:  Color(red: 0.961, green: 0.933, blue: 0.878)
        ),
        inkSoft: Color(
            light: Color(red: 0.388, green: 0.329, blue: 0.251),
            dark:  Color(red: 0.769, green: 0.729, blue: 0.663)
        ),
        inkMuted: Color(
            light: Color(red: 0.612, green: 0.553, blue: 0.463),
            dark:  Color(red: 0.553, green: 0.510, blue: 0.439)
        ),
        rule: Color(
            light: Color(red: 0.176, green: 0.137, blue: 0.102, opacity: 0.10),
            dark:  Color(red: 0.961, green: 0.933, blue: 0.878, opacity: 0.12)
        ),
        ruleStrong: Color(
            light: Color(red: 0.176, green: 0.137, blue: 0.102, opacity: 0.18),
            dark:  Color(red: 0.961, green: 0.933, blue: 0.878, opacity: 0.22)
        ),
        accent: Color(
            light: Color(red: 0.510, green: 0.208, blue: 0.129),      // rust accent
            dark:  Color(red: 0.894, green: 0.522, blue: 0.412)
        ),
        highlight: Color(
            light: Color(red: 0.992, green: 0.863, blue: 0.529, opacity: 0.45),
            dark:  Color(red: 0.894, green: 0.651, blue: 0.325, opacity: 0.40)
        )
    )

    let typography = LineaTypography(
        display: LineaFont(family: .editorialSerif, defaultSize: 30, defaultWeight: .medium,  italic: false),
        serif:   LineaFont(family: .editorialSerif, defaultSize: 17, defaultWeight: .regular, italic: false),
        ui:      LineaFont(family: .systemSans,     defaultSize: 13, defaultWeight: .regular, italic: false),
        mono:    LineaFont(family: .systemMono,     defaultSize: 12, defaultWeight: .regular, italic: false)
    )

    let radii = LineaRadii(
        sharp: 3, sm: 6, md: 12, lg: 16, xl: 22, pill: 999
    )

    let preferredColorScheme: ColorScheme? = .light
}
