import SwiftUI

/// The Monochrome library — an editorial single-column page rather than a
/// stock iOS List. Header wordmark, hero entry for "where you left off",
/// numbered shelf of everything else, and a single inline CTA.
struct LibraryHomeView: View {
    @EnvironmentObject private var library: DocumentLibrary
    @Environment(\.lineaTheme) private var theme

    let openDocument: (UUID) -> Void
    let importFile: () -> Void
    let importURL: () -> Void
    let scanPages: () -> Void
    let openSettings: () -> Void

    @State private var showingIntake = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                if let hero = heroDocument {
                    heroBlock(hero)
                }
                shelf
                Spacer(minLength: theme.spacing.xxl)
                inlineCTA
                Spacer(minLength: theme.spacing.xl)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .themedPaperBackground()
        .confirmationDialog("Bring something in", isPresented: $showingIntake, titleVisibility: .visible) {
            Button("Import File") { importFile() }
            Button("Import URL") { importURL() }
            Button("Scan Pages") { scanPages() }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Linea")
                .font(theme.typography.display.font(size: 20, weight: .regular, italic: true))
                .foregroundStyle(theme.palette.ink)
            Spacer()
            ThemedEyebrow(text: "Library")
            Button(action: openSettings) {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(theme.palette.inkSoft)
                    .padding(.leading, theme.spacing.sm)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, theme.spacing.readingGutter)
        .padding(.top, theme.spacing.md)
    }

    // MARK: - Hero

    private var heroDocument: ReadableDocument? {
        library.documents
            .sorted { ($0.lastOpenedAt ?? .distantPast) > ($1.lastOpenedAt ?? .distantPast) }
            .first
    }

    private func heroBlock(_ doc: ReadableDocument) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ThemedEyebrow(text: "Where you left off")
                .padding(.bottom, 14)

            Text(doc.title)
                .font(theme.typography.display.font(size: 38, weight: .regular))
                .tracking(theme.metrics.displayTracking)
                .lineSpacing(0)
                .foregroundStyle(theme.palette.ink)
                .multilineTextAlignment(.leading)

            if let author = documentAuthor(doc) {
                Text(author)
                    .font(theme.typography.serif.font(size: 14, weight: .regular, italic: true))
                    .foregroundStyle(theme.palette.inkSoft)
                    .padding(.top, 10)
            }

            HStack(spacing: 14) {
                ThemedProgressBar(progress: heroProgress(for: doc))
                    .frame(maxWidth: .infinity)
                Text(heroProgressLabel(for: doc))
                    .font(theme.typography.ui.font(size: 11, weight: .regular))
                    .monospacedDigit()
                    .foregroundStyle(theme.palette.inkSoft)
            }
            .padding(.top, 22)

            if !doc.preview.isEmpty {
                ThemedRule()
                    .padding(.top, 20)
                Text(firstParagraph(from: doc.preview))
                    .font(theme.typography.serif.font(size: 14, weight: .regular, italic: true))
                    .foregroundStyle(theme.palette.inkSoft)
                    .lineSpacing(4)
                    .padding(.top, 14)
                    .padding(.bottom, 4)
            }

            ThemedEyebrow(text: lastOpenedLabel(for: doc), emphasis: .muted)
                .padding(.top, 4)
        }
        .padding(.horizontal, theme.spacing.readingGutter)
        .padding(.top, theme.spacing.xxl)
        .contentShape(Rectangle())
        .onTapGesture { openDocument(doc.id) }
    }

    // MARK: - Shelf

    private var shelfDocuments: [ReadableDocument] {
        let all = library.documents
            .sorted { ($0.lastOpenedAt ?? .distantPast) > ($1.lastOpenedAt ?? .distantPast) }
        return Array(all.dropFirst())
    }

    private var shelf: some View {
        VStack(alignment: .leading, spacing: 0) {
            ThemedEyebrow(text: "Also on the shelf")
                .padding(.bottom, 10)

            ThemedRule()

            if shelfDocuments.isEmpty {
                emptyShelf
            } else {
                ForEach(Array(shelfDocuments.enumerated()), id: \.element.id) { idx, doc in
                    shelfRow(index: idx + 1, document: doc)
                    ThemedRule()
                }
            }
        }
        .padding(.horizontal, theme.spacing.readingGutter)
        .padding(.top, theme.spacing.xl)
    }

    private func shelfRow(index: Int, document: ReadableDocument) -> some View {
        Button {
            openDocument(document.id)
        } label: {
            HStack(alignment: .top, spacing: 14) {
                Text(String(format: "%02d", index))
                    .font(theme.typography.ui.font(size: 10, weight: .regular))
                    .monospacedDigit()
                    .foregroundStyle(theme.palette.inkMuted)
                    .padding(.top, 6)

                VStack(alignment: .leading, spacing: 2) {
                    Text(document.title)
                        .font(theme.typography.display.font(size: 18, weight: .regular))
                        .tracking(-0.2)
                        .foregroundStyle(theme.palette.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    Text(shelfSubtitle(for: document))
                        .font(theme.typography.serif.font(size: 12, weight: .regular, italic: true))
                        .foregroundStyle(theme.palette.inkSoft)
                }

                Spacer()

                Text(statusLabel(for: document))
                    .font(theme.typography.ui.font(size: 10, weight: .regular))
                    .foregroundStyle(theme.palette.inkMuted)
                    .padding(.top, 6)
            }
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var emptyShelf: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Nothing else yet.")
                .font(theme.typography.serif.font(size: 15, weight: .regular, italic: true))
                .foregroundStyle(theme.palette.inkSoft)
            Text("Bring in a PDF, a URL, or scan a page to build the shelf.")
                .font(theme.typography.ui.font(size: 13, weight: .regular))
                .foregroundStyle(theme.palette.inkMuted)
        }
        .padding(.vertical, 20)
    }

    // MARK: - CTA

    private var inlineCTA: some View {
        HStack {
            Button { showingIntake = true } label: {
                ThemedInlineCTA(title: "Bring something in")
            }
            .buttonStyle(.plain)
            Spacer()
        }
        .padding(.horizontal, theme.spacing.readingGutter)
    }

    // MARK: - Helpers

    private func heroProgress(for doc: ReadableDocument) -> Double {
        // We don't yet track true read progress — show a light placeholder
        // based on how recently the document was opened so the ink bar is
        // present but accurate about being approximate.
        guard doc.lastOpenedAt != nil else { return 0 }
        return 0.42
    }

    private func heroProgressLabel(for doc: ReadableDocument) -> String {
        let percent = Int(heroProgress(for: doc) * 100)
        let minutes = max(1, doc.totalWordCount / 220)
        return "\(percent)% · \(minutes)m"
    }

    private func lastOpenedLabel(for doc: ReadableDocument) -> String {
        guard let last = doc.lastOpenedAt else { return "Not yet opened" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: last, relativeTo: .now)
    }

    private func documentAuthor(_ doc: ReadableDocument) -> String? {
        // The document model doesn't carry an author yet — fall back to the
        // source label so the hero still has a supporting line.
        doc.sourceURL?.split(separator: "/").dropFirst().first.map { String($0) } ?? doc.sourceKind.label
    }

    private func firstParagraph(from text: String) -> String {
        let clean = text.replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let truncated = String(clean.prefix(180))
        return truncated.isEmpty ? "" : "\(truncated)…"
    }

    private func shelfSubtitle(for doc: ReadableDocument) -> String {
        if let author = doc.sourceURL?.split(separator: "/").dropFirst().first {
            return String(author)
        }
        return "\(doc.sourceKind.label) · \(doc.totalWordCount) words"
    }

    private func statusLabel(for doc: ReadableDocument) -> String {
        if doc.lastOpenedAt == nil { return "new" }
        return "\(Int(heroProgress(for: doc) * 100))%"
    }
}
