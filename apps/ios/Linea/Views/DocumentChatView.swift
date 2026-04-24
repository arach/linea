import SwiftUI

struct DocumentChatView: View {
    let documentID: UUID
    let focusedSectionID: UUID?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.lineaTheme) private var theme
    @EnvironmentObject private var library: DocumentLibrary
    @EnvironmentObject private var chatService: DocumentChatService

    @State private var draft = ""
    @State private var threadID: UUID?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                ThemedRule()
                anchorPin
                conversationScrollView
                composer
            }
            .themedPaperBackground()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .task {
                if threadID == nil {
                    threadID = library.document(id: documentID)?.conversationThreads.first?.id
                }
            }
            .alert(
                "Chat unavailable",
                isPresented: Binding(
                    get: { errorMessage != nil },
                    set: { if !$0 { errorMessage = nil } }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "")
            }
        }
        .tint(theme.palette.ink)
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Ask")
                .font(theme.typography.display.font(size: 22, weight: .regular, italic: true))
                .foregroundStyle(theme.palette.ink)
            Spacer()
            ThemedEyebrow(text: "Grounded in this text")
            Button(action: { dismiss() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(theme.palette.inkSoft)
                    .padding(.leading, theme.spacing.sm)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, theme.spacing.readingGutter)
        .padding(.top, theme.spacing.lg)
        .padding(.bottom, theme.spacing.sm)
    }

    // MARK: - Anchor pin

    @ViewBuilder
    private var anchorPin: some View {
        if let section = focusedSection {
            HStack(alignment: .top, spacing: 10) {
                Rectangle()
                    .fill(theme.palette.ink)
                    .frame(width: 4)

                VStack(alignment: .leading, spacing: 4) {
                    ThemedEyebrow(text: "Pinned · \(section.title)")
                    Text(quoteSnippet(from: section.text))
                        .font(theme.typography.serif.font(size: 12.5, weight: .regular, italic: true))
                        .foregroundStyle(theme.palette.inkSoft)
                        .lineSpacing(2)
                        .lineLimit(3)
                }
                Spacer()
            }
            .padding(12)
            .background(theme.palette.paperDim)
            .overlay(
                Rectangle().stroke(theme.palette.rule, lineWidth: theme.metrics.hairline)
            )
            .padding(.horizontal, theme.spacing.readingGutter)
            .padding(.vertical, theme.spacing.sm)
        }
    }

    // MARK: - Thread

    private var conversationScrollView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.spacing.lg) {
                if turns.isEmpty {
                    chatEmptyState
                } else {
                    ForEach(turns) { turn in
                        turnRow(for: turn)
                    }
                }
            }
            .padding(.horizontal, theme.spacing.readingGutter)
            .padding(.vertical, theme.spacing.md)
        }
    }

    private func turnRow(for turn: DocumentConversationTurn) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ThemedEyebrow(text: turn.role == .assistant ? "Linea" : "You asked")

            if turn.role == .user {
                Text(turn.text)
                    .font(theme.typography.display.font(size: 20, weight: .regular, italic: true))
                    .tracking(theme.metrics.displayTracking)
                    .foregroundStyle(theme.palette.ink)
            } else {
                Text(turn.text)
                    .font(theme.typography.serif.font(size: 15, weight: .regular))
                    .foregroundStyle(theme.palette.ink)
                    .lineSpacing(4)
                    .textSelection(.enabled)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var chatEmptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            ThemedEyebrow(text: "Start a conversation")
            Text("Ask for a summary, unpack a dense section, or pressure-test your understanding.")
                .font(theme.typography.serif.font(size: 15, weight: .regular, italic: true))
                .foregroundStyle(theme.palette.inkSoft)
                .lineSpacing(3)
        }
        .padding(.vertical, 20)
    }

    // MARK: - Composer

    private var composer: some View {
        VStack(alignment: .leading, spacing: 10) {
            if chatService.isAvailable, let provider = chatService.activeProvider {
                ThemedEyebrow(text: "Linea via \(provider.label) · \(provider.modelLabel)")
            }

            if !chatService.isAvailable {
                Text(chatService.availabilityReason)
                    .font(theme.typography.ui.font(size: 12))
                    .foregroundStyle(theme.palette.inkMuted)
            }

            if chatService.isAvailable {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        suggestionButton("Summarize this section")
                        suggestionButton("What matters most here?")
                        suggestionButton("Explain the difficult parts")
                    }
                }
            }

            HStack(alignment: .center, spacing: 10) {
                TextField("Ask something more…", text: $draft, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(theme.typography.serif.font(size: 14, weight: .regular, italic: true))
                    .foregroundStyle(theme.palette.ink)
                    .lineLimit(1...4)

                Button {
                    send()
                } label: {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(isSendEnabled ? theme.palette.ink : theme.palette.inkMuted)
                        .padding(6)
                }
                .buttonStyle(.plain)
                .disabled(!isSendEnabled)
            }
            .padding(12)
            .background(theme.palette.paperDim)
            .overlay(
                Rectangle().stroke(theme.palette.rule, lineWidth: theme.metrics.hairline)
            )

            if chatService.isResponding {
                HStack(spacing: 6) {
                    ProgressView().scaleEffect(0.7).tint(theme.palette.inkSoft)
                    Text("Thinking…")
                        .font(theme.typography.ui.font(size: 11))
                        .foregroundStyle(theme.palette.inkSoft)
                }
            }
        }
        .padding(.horizontal, theme.spacing.readingGutter)
        .padding(.vertical, theme.spacing.md)
        .background(theme.palette.paper)
        .overlay(alignment: .top) { ThemedRule() }
    }

    private func suggestionButton(_ prompt: String) -> some View {
        Button {
            draft = prompt
        } label: {
            Text(prompt)
                .font(theme.typography.ui.font(size: 11, weight: .regular))
                .foregroundStyle(theme.palette.inkSoft)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .overlay(
                    Capsule().stroke(theme.palette.rule, lineWidth: theme.metrics.hairline)
                )
        }
        .buttonStyle(.plain)
    }

    // MARK: - State

    private var focusedSection: DocumentSection? {
        guard let focusedSectionID,
              let document = library.document(id: documentID) else { return nil }
        return document.sections.first(where: { $0.id == focusedSectionID })
    }

    private var turns: [DocumentConversationTurn] {
        guard let document = library.document(id: documentID) else { return [] }
        let resolvedThreadID = threadID ?? document.conversationThreads.first?.id
        return document.conversationThreads
            .first(where: { $0.id == resolvedThreadID })?
            .turns ?? []
    }

    private var isSendEnabled: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !chatService.isResponding
    }

    private func quoteSnippet(from text: String) -> String {
        let clean = text.replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespaces)
        return "\u{201C}\(String(clean.prefix(180)))…\u{201D}"
    }

    private func send() {
        let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return }
        guard let document = library.document(id: documentID) else { return }

        let focusedSection = document.sections.first(where: { $0.id == focusedSectionID })
        let threadTitle = focusedSection?.title ?? "Document Chat"

        let userTurn = DocumentConversationTurn(role: .user, text: question)
        let thread = library.appendConversationTurn(
            documentID: documentID,
            threadID: threadID,
            title: threadTitle,
            turn: userTurn
        )

        threadID = thread?.id
        draft = ""

        Task {
            do {
                let latestDocument = library.document(id: documentID) ?? document
                let latestThread = latestDocument.conversationThreads.first(where: { $0.id == threadID })
                let answer = try await chatService.answer(
                    question: question,
                    in: latestDocument,
                    thread: latestThread,
                    focusedSection: focusedSection
                )

                _ = library.appendConversationTurn(
                    documentID: documentID,
                    threadID: threadID,
                    title: threadTitle,
                    turn: DocumentConversationTurn(role: .assistant, text: answer)
                )
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
