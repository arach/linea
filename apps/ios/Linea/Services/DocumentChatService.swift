import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

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

@MainActor
final class DocumentChatService: ObservableObject {
    static let shared = DocumentChatService()

    @Published private(set) var isAvailable = false
    @Published private(set) var availabilityReason = "On-device document chat is not available."
    @Published private(set) var isResponding = false

    private init() {
        Task {
            await refreshAvailability()
        }
    }

    func refreshAvailability() async {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                isAvailable = true
                availabilityReason = "On-device chat is ready."
            case .unavailable(let reason):
                isAvailable = false
                availabilityReason = "Apple Intelligence is unavailable: \(reason)"
            @unknown default:
                isAvailable = false
                availabilityReason = "Apple Intelligence is unavailable on this device."
            }
        } else {
            isAvailable = false
            availabilityReason = "This build needs iOS 26 or later for on-device chat."
        }
        #else
        isAvailable = false
        availabilityReason = "Foundation Models are not available in this SDK."
        #endif
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

        guard isAvailable else {
            throw DocumentChatError.unavailable(availabilityReason)
        }

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            isResponding = true
            defer { isResponding = false }

            let session = LanguageModelSession(instructions: Self.systemPrompt)
            let response = try await session.respond(
                to: makePrompt(
                    question: trimmedQuestion,
                    document: document,
                    thread: thread,
                    focusedSection: focusedSection
                ),
                options: FoundationModels.GenerationOptions(temperature: 0.3)
            )

            return response.content.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        #endif

        throw DocumentChatError.unavailable(availabilityReason)
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
