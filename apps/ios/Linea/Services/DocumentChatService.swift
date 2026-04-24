import Foundation
import LineaCore

enum DocumentChatError: LocalizedError {
    case unavailable(String)
    case emptyQuestion

    var errorDescription: String? {
        switch self {
        case .unavailable(let reason):
            return reason
        case .emptyQuestion:
            return "Ask a question about the document to start the conversation."
        }
    }
}

/// Thin orchestrator: picks a provider from `LLMProviderRegistry` based on the
/// user's active selection in `LineaSettings`, then forwards the prompt.
@MainActor
final class DocumentChatService: ObservableObject {
    @Published private(set) var isResponding = false

    private let registry: LLMProviderRegistry
    private let settings: LineaSettings

    init(registry: LLMProviderRegistry, settings: LineaSettings) {
        self.registry = registry
        self.settings = settings
    }

    /// `true` when at least one provider can serve a request right now.
    var isAvailable: Bool {
        !registry.usableProviders.isEmpty
    }

    /// Only meaningful when `isAvailable == false`. UI should hide anything
    /// else and show a single "no providers configured" hint.
    var availabilityReason: String {
        "No chat providers configured. Add an API key in Settings to enable document chat."
    }

    /// The provider the user has selected, or the first usable one. May be
    /// `nil` if nothing is configured yet.
    var activeProvider: LLMProvider? {
        if let selected = registry.provider(for: settings.chatProviderID),
           selected.isAvailable {
            return selected
        }
        return registry.usableProviders.first
    }

    func answer(
        question: String,
        in document: ReadableDocument,
        thread: DocumentConversationThread?,
        focusedSection: DocumentSection?
    ) async throws -> String {
        let trimmedQuestion = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuestion.isEmpty else {
            throw DocumentChatError.emptyQuestion
        }

        guard let provider = activeProvider else {
            throw DocumentChatError.unavailable(availabilityReason)
        }

        isResponding = true
        defer { isResponding = false }

        let prompt = makePrompt(
            question: trimmedQuestion,
            document: document,
            thread: thread,
            focusedSection: focusedSection
        )

        return try await provider.answer(
            prompt: prompt,
            systemPrompt: Self.systemPrompt,
            temperature: 0.3
        )
    }

    private func makePrompt(
        question: String,
        document: ReadableDocument,
        thread: DocumentConversationThread?,
        focusedSection: DocumentSection?
    ) -> String {
        let contextWindow = focusedSection?.text ?? String(document.fullText.prefix(6_000))
        let history = thread?.turns.suffix(6).map {
            "\($0.role.rawValue.capitalized): \($0.text)"
        }.joined(separator: "\n\n") ?? ""

        return [
            "Document title: \(document.title)",
            "Source kind: \(document.sourceKind.label)",
            focusedSection.map { "Focused section: \($0.title)" } ?? "",
            history.isEmpty ? "" : "Conversation so far:\n\(history)",
            "Document context:\n\(contextWindow)",
            "Reader question:\n\(question)"
        ]
        .filter { !$0.isEmpty }
        .joined(separator: "\n\n")
    }

    private static let systemPrompt = """
    You are Linea, a calm reading companion for people trying to understand difficult material.
    Stay tightly grounded in the current document and section.
    Answer directly, define jargon when helpful, and avoid hype.
    Keep responses concise unless the user explicitly asks for more detail.
    """
}
