import Foundation

/// Minimal protocol every Linea chat provider implements.
///
/// Providers are value-like services that may talk to the network or the
/// on-device Foundation Models runtime. They are `Sendable` so callers can
/// hop between actors without fencing.
protocol LLMProvider: Sendable {
    /// Stable identifier, e.g. `"openai"`, `"appleLocal"`.
    var id: String { get }

    /// Human-readable label for UI, e.g. `"OpenAI"`.
    var label: String { get }

    /// Short description of the default model, e.g. `"Claude 3.5 Haiku"`.
    var modelLabel: String { get }

    /// `true` when the provider has the credentials / prerequisites it needs.
    var isConfigured: Bool { get }

    /// `true` when the provider can actually serve a request right now.
    /// For remote providers this is equivalent to `isConfigured`.
    /// For on-device providers this also checks runtime availability.
    var isAvailable: Bool { get }

    /// Produce a single, non-streaming answer.
    func answer(
        prompt: String,
        systemPrompt: String,
        temperature: Double
    ) async throws -> String
}

/// Common error surface for providers.
enum LLMProviderError: LocalizedError {
    case notConfigured(String)
    case notAvailable(String)
    case transport(String)
    case malformedResponse(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured(let msg),
             .notAvailable(let msg),
             .transport(let msg),
             .malformedResponse(let msg):
            return msg
        }
    }
}
