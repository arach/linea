import SwiftUI

// MARK: - Theme identity

enum LineaThemeID: String, CaseIterable, Identifiable, Codable {
    case monochrome
    case paper
    case dusk

    var id: String { rawValue }

    var label: String {
        switch self {
        case .monochrome: "Quiet Monochrome"
        case .paper: "Paper & Ink"
        case .dusk: "Editorial Dusk"
        }
    }

    var shortLabel: String {
        switch self {
        case .monochrome: "Mono"
        case .paper: "Paper"
        case .dusk: "Dusk"
        }
    }

    var blurb: String {
        switch self {
        case .monochrome: "Near-white paper, modern literary serif, minimal chrome."
        case .paper: "Warm cream, transitional serif, hand-annotated feel."
        case .dusk: "Ink on stone, confident magazine typography."
        }
    }
}

// MARK: - Token groups

struct LineaPalette {
    /// Primary reading surface.
    var paper: Color
    /// Secondary surface — slightly dimmer than paper, used for sheets and rails.
    var paperDim: Color
    /// Lifted surface for focused content (cards, modals).
    var lift: Color
    /// Primary type.
    var ink: Color
    /// Secondary / supporting type.
    var inkSoft: Color
    /// Tertiary / labels and metadata.
    var inkMuted: Color
    /// Hairline separators.
    var rule: Color
    /// Stronger separators / pressed state.
    var ruleStrong: Color
    /// Accent used for emphasis (usually ink in monochrome directions).
    var accent: Color
    /// Highlight fill for active selections.
    var highlight: Color
}

struct LineaTypography {
    var display: LineaFont
    var serif: LineaFont
    var ui: LineaFont
    var mono: LineaFont
}

struct LineaFont {
    enum Family {
        /// Prefers bundled Newsreader when available, falls back to New York (SF Serif).
        case editorialSerif
        /// System sans-serif (SF Pro).
        case systemSans
        /// System monospace (SF Mono).
        case systemMono
    }

    var family: Family
    var defaultSize: CGFloat
    var defaultWeight: Font.Weight
    var italic: Bool

    func font(size: CGFloat? = nil, weight: Font.Weight? = nil, italic: Bool? = nil) -> Font {
        let resolvedSize = size ?? defaultSize
        let resolvedWeight = weight ?? defaultWeight
        let resolvedItalic = italic ?? self.italic

        let base: Font
        switch family {
        case .editorialSerif:
            base = .system(size: resolvedSize, weight: resolvedWeight, design: .serif)
        case .systemSans:
            base = .system(size: resolvedSize, weight: resolvedWeight, design: .default)
        case .systemMono:
            base = .system(size: resolvedSize, weight: resolvedWeight, design: .monospaced)
        }

        return resolvedItalic ? base.italic() : base
    }
}

struct LineaSpacing {
    var xxs: CGFloat = 4
    var xs: CGFloat = 8
    var sm: CGFloat = 12
    var md: CGFloat = 16
    var lg: CGFloat = 22
    var xl: CGFloat = 32
    var xxl: CGFloat = 44

    /// Padding used for the outer edge of reading surfaces.
    var readingGutter: CGFloat = 22
}

struct LineaRadii {
    /// Near-zero used for editorial blocks (mono direction).
    var sharp: CGFloat = 2
    var sm: CGFloat = 6
    var md: CGFloat = 12
    var lg: CGFloat = 18
    var xl: CGFloat = 22
    /// Used for sheet grabbers, pills, chips.
    var pill: CGFloat = 999
}

struct LineaMetrics {
    /// Width of the primary separator hairline.
    var hairline: CGFloat = 1
    /// Upper-case label tracking (expressed as points of kerning for SwiftUI).
    var labelTracking: CGFloat = 1.8
    /// Display tracking — tightened slightly.
    var displayTracking: CGFloat = -0.4
}

// MARK: - Theme protocol

protocol LineaTheme: Sendable {
    var id: LineaThemeID { get }
    var palette: LineaPalette { get }
    var typography: LineaTypography { get }
    var spacing: LineaSpacing { get }
    var radii: LineaRadii { get }
    var metrics: LineaMetrics { get }
    /// Hint to SwiftUI about whether this theme reads better in light or dark.
    /// Returning nil lets the user's system preference win.
    var preferredColorScheme: ColorScheme? { get }
}

extension LineaTheme {
    var spacing: LineaSpacing { LineaSpacing() }
    var radii: LineaRadii { LineaRadii() }
    var metrics: LineaMetrics { LineaMetrics() }
    var preferredColorScheme: ColorScheme? { nil }
}

// MARK: - Registry

enum LineaThemeRegistry {
    static func theme(for id: LineaThemeID) -> LineaTheme {
        switch id {
        case .monochrome: MonochromeTheme()
        case .paper: PaperTheme()
        case .dusk: DuskTheme()
        }
    }
}
