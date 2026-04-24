import SwiftUI
import LineaCore

struct ReaderView: View {
    let documentID: UUID

    @EnvironmentObject private var library: DocumentLibrary
    @EnvironmentObject private var speech: SpeechService
    @EnvironmentObject private var settings: LineaSettings
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var extractionService: PDFExtractionService
    @Environment(\.pageTextStore) private var pageTextStore
    @Environment(\.lineaTheme) private var theme

    @State private var selectedSectionID: UUID?
    @State private var showingChat = false

    var body: some View {
        Group {
            if let document = library.document(id: documentID) {
                ScrollView {
                    VStack(alignment: .leading, spacing: theme.spacing.xl) {
                        readerHeader(for: document)
                        ThemedRule()
                        extractionStatus(for: document)
                        sectionsBlock(for: document)
                    }
                    .padding(.horizontal, theme.spacing.readingGutter)
                    .padding(.vertical, theme.spacing.xl)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .themedPaperBackground()
                .navigationTitle("")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .principal) {
                        ThemedEyebrow(text: sectionIndexLabel(for: document))
                    }
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button {
                            togglePlayback(for: document)
                        } label: {
                            Image(systemName: playbackIcon(for: document))
                                .font(.system(size: 16, weight: .regular))
                                .foregroundStyle(theme.palette.ink)
                        }
                        Button {
                            showingChat = true
                        } label: {
                            Image(systemName: "bubble.left")
                                .font(.system(size: 16, weight: .regular))
                                .foregroundStyle(theme.palette.ink)
                        }
                    }
                }
                .sheet(isPresented: $showingChat) {
                    DocumentChatView(
                        documentID: document.id,
                        focusedSectionID: selectedSectionID
                    )
                }
                .onAppear {
                    library.markOpened(documentID: document.id)
                    if selectedSectionID == nil {
                        selectedSectionID = document.sections.first?.id
                    }
                }
            } else {
                ContentUnavailableView("Document Missing", systemImage: "exclamationmark.triangle")
                    .themedPaperBackground()
            }
        }
    }

    // MARK: - Header

    private func readerHeader(for document: ReadableDocument) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            ThemedEyebrow(text: document.sourceKind.label)
            Text(document.title)
                .font(theme.typography.display.font(size: 34, weight: .regular))
                .tracking(theme.metrics.displayTracking)
                .foregroundStyle(theme.palette.ink)
                .multilineTextAlignment(.leading)

            Text(document.subtitle)
                .font(theme.typography.serif.font(size: 14, weight: .regular, italic: true))
                .foregroundStyle(theme.palette.inkSoft)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Extraction status

    @ViewBuilder
    private func extractionStatus(for document: ReadableDocument) -> some View {
        let progress = extractionService.progress(for: document.id)
        let isRunning = !document.extractionComplete && progress.status != .complete
        if isRunning && progress.pageCount > 0 {
            ThemedEyebrow(
                text: "Preparing pages \(progress.extractedCount) / \(progress.pageCount)",
                emphasis: .soft
            )
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func sectionsBlock(for document: ReadableDocument) -> some View {
        if document.sections.isEmpty {
            let progress = extractionService.progress(for: document.id)
            if !document.extractionComplete {
                preparingPlaceholder(pageCount: max(progress.pageCount, document.pageCount))
            }
        } else {
            VStack(alignment: .leading, spacing: theme.spacing.lg) {
                ForEach(document.sections) { section in
                    sectionCard(for: section)
                        .onTapGesture { selectedSectionID = section.id }
                }
            }
        }
    }

    private func preparingPlaceholder(pageCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ThemedEyebrow(text: "Preparing", emphasis: .strong)
            Text(pageCount > 0 ? "Preparing pages 1–\(pageCount)" : "Preparing pages")
                .font(theme.typography.serif.font(size: 16.5, weight: .regular, italic: true))
                .foregroundStyle(theme.palette.inkSoft)
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: theme.radii.md, style: .continuous)
                .fill(theme.palette.paperDim)
        )
    }

    @ViewBuilder
    private func sectionCard(for section: DocumentSection) -> some View {
        let isSelected = selectedSectionID == section.id
        SectionBody(
            section: section,
            documentID: documentID,
            isSelected: isSelected,
            onListen: { listen(from: section) }
        )
        .padding(.horizontal, isSelected ? 14 : 0)
        .padding(.vertical, isSelected ? 16 : 4)
        .background(
            Group {
                if isSelected {
                    RoundedRectangle(cornerRadius: theme.radii.md, style: .continuous)
                        .fill(theme.palette.lift)
                        .shadow(color: .black.opacity(0.06), radius: 18, x: 0, y: 8)
                }
            }
        )
    }

    // MARK: - Helpers

    private func listen(from section: DocumentSection) {
        guard let document = library.document(id: documentID) else { return }
        Task {
            let token = await auth.authToken
            await speech.speak(
                document: document,
                startingAt: section,
                settings: settings,
                authToken: token
            )
        }
    }

    private func sectionIndexLabel(for document: ReadableDocument) -> String {
        guard let id = selectedSectionID,
              let idx = document.sections.firstIndex(where: { $0.id == id }) else {
            return document.title
        }
        return "§ \(idx + 1) · \(document.sections.count)"
    }

    private func togglePlayback(for document: ReadableDocument) {
        if speech.activeDocumentID == document.id {
            speech.pauseOrResume()
            return
        }

        let selectedSection = document.sections.first(where: { $0.id == selectedSectionID })
        Task {
            let token = await auth.authToken
            await speech.speak(
                document: document,
                startingAt: selectedSection,
                settings: settings,
                authToken: token
            )
        }
    }

    private func playbackIcon(for document: ReadableDocument) -> String {
        if speech.activeDocumentID == document.id {
            return speech.isSpeaking ? "pause" : "play"
        }
        return "speaker.wave.2"
    }
}

// MARK: - Section rendering with lazy text loading

private struct SectionBody: View {
    let section: DocumentSection
    let documentID: UUID
    let isSelected: Bool
    let onListen: () -> Void

    @Environment(\.lineaTheme) private var theme
    @Environment(\.pageTextStore) private var pageTextStore
    @State private var loadedText: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(section.title)
                    .font(theme.typography.display.font(size: 20, weight: .regular))
                    .tracking(theme.metrics.displayTracking)
                    .foregroundStyle(theme.palette.ink)
                Spacer()
                if section.pageNumber != nil || section.pageRange != nil {
                    ThemedEyebrow(text: pageLabel)
                }
            }

            Text(resolvedText)
                .font(theme.typography.serif.font(size: 16.5, weight: .regular))
                .foregroundStyle(theme.palette.ink.opacity(isSelected ? 1 : 0.78))
                .lineSpacing(5)
                .textSelection(.enabled)

            ThemedRule()

            HStack {
                Text("\(wordCount) words")
                    .font(theme.typography.ui.font(size: 11, weight: .regular))
                    .foregroundStyle(theme.palette.inkMuted)
                Spacer()
                Button("Listen from here", action: onListen)
                    .font(theme.typography.ui.font(size: 11, weight: .medium))
                    .foregroundStyle(theme.palette.ink)
                    .buttonStyle(.plain)
            }
        }
        .task(id: section.id) {
            await loadIfNeeded()
        }
    }

    private var resolvedText: String {
        if !section.text.isEmpty { return section.text }
        return loadedText
    }

    private var wordCount: Int {
        !section.text.isEmpty ? section.wordCount : loadedText.lineaWordCount
    }

    private var pageLabel: String {
        if let range = section.pageRange, range.lowerBound != range.upperBound {
            return "Pages \(range.lowerBound)–\(range.upperBound)"
        }
        if let pageNumber = section.pageNumber {
            return "Page \(pageNumber)"
        }
        return ""
    }

    private func loadIfNeeded() async {
        guard section.text.isEmpty, loadedText.isEmpty else { return }
        let text = await section.sectionText(loadingWith: pageTextStore, documentID: documentID)
        await MainActor.run {
            self.loadedText = text
        }
    }
}
