import SwiftUI

// MARK: - Surface background

/// Applies the theme's paper colour to the full background of a view.
struct ThemedPaperBackground: ViewModifier {
    @Environment(\.lineaTheme) private var theme
    var dim: Bool = false

    func body(content: Content) -> some View {
        content.background(
            (dim ? theme.palette.paperDim : theme.palette.paper)
                .ignoresSafeArea()
        )
    }
}

extension View {
    func themedPaperBackground(dim: Bool = false) -> some View {
        modifier(ThemedPaperBackground(dim: dim))
    }
}

// MARK: - Upper-case metadata label

/// The small tracking-wide uppercase labels used throughout the design:
/// "WHERE YOU LEFT OFF", "§ 3.2", "GROUNDED IN THIS TEXT", etc.
struct ThemedEyebrow: View {
    @Environment(\.lineaTheme) private var theme
    let text: String
    var emphasis: Emphasis = .muted

    enum Emphasis { case strong, soft, muted }

    var body: some View {
        Text(text.uppercased())
            .font(theme.typography.ui.font(size: 10, weight: .medium))
            .tracking(theme.metrics.labelTracking)
            .foregroundStyle(color)
    }

    private var color: Color {
        switch emphasis {
        case .strong: theme.palette.ink
        case .soft:   theme.palette.inkSoft
        case .muted:  theme.palette.inkMuted
        }
    }
}

// MARK: - Hairline rule

struct ThemedRule: View {
    @Environment(\.lineaTheme) private var theme
    var strong: Bool = false

    var body: some View {
        Rectangle()
            .fill(strong ? theme.palette.ruleStrong : theme.palette.rule)
            .frame(height: theme.metrics.hairline)
    }
}

// MARK: - Progress bar (thin hairline with fill)

struct ThemedProgressBar: View {
    @Environment(\.lineaTheme) private var theme
    let progress: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle().fill(theme.palette.rule)
                Rectangle()
                    .fill(theme.palette.ink)
                    .frame(width: geo.size.width * CGFloat(max(0, min(1, progress))))
            }
        }
        .frame(height: theme.metrics.hairline)
    }
}

// MARK: - Editorial initial monogram

/// The Mono direction replaces covers with a one-letter monogram card.
struct ThemedMonogram: View {
    @Environment(\.lineaTheme) private var theme
    let title: String
    var size: CGSize = CGSize(width: 40, height: 54)

    var body: some View {
        let letter = String((title.trimmingCharacters(in: .whitespaces).first ?? "·")).uppercased()
        ZStack {
            Rectangle().fill(theme.palette.paperDim)
            Rectangle()
                .stroke(theme.palette.rule, lineWidth: theme.metrics.hairline)
            Text(letter)
                .font(theme.typography.display.font(size: 22, weight: .regular))
                .tracking(-0.2)
                .foregroundStyle(theme.palette.ink)
        }
        .frame(width: size.width, height: size.height)
    }
}

// MARK: - Underlined italic CTA

/// The Mono direction renders actions as a thin italic label with an ink underline
/// and a trailing arrow — used for "Bring something in", "Continue reading", etc.
struct ThemedInlineCTA: View {
    @Environment(\.lineaTheme) private var theme
    let title: String
    var showArrow: Bool = true

    var body: some View {
        HStack(spacing: 10) {
            Text(title)
                .font(theme.typography.display.font(size: 17, weight: .regular, italic: true))
                .foregroundStyle(theme.palette.ink)
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(theme.palette.ink)
                        .frame(height: theme.metrics.hairline)
                        .offset(y: 3)
                }

            if showArrow {
                Image(systemName: "arrow.right")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(theme.palette.ink)
            }
        }
        .contentShape(Rectangle())
    }
}
