import Foundation

/// Groq chat completions provider (OpenAI-compatible).
/// Defaults to `llama-3.3-70b-versatile`.
final class GroqProvider: LLMProvider {
    let id = "groq"
    let label = "Groq"
    let modelLabel: String
    private let model: String
    private let keyStore: APIKeyStore

    init(model: String = "llama-3.3-70b-versatile", keyStore: APIKeyStore = .shared) {
        self.model = model
        self.modelLabel = Self.displayName(for: model)
        self.keyStore = keyStore
    }

    var isConfigured: Bool {
        keyStore.hasKey(providerID: id)
    }

    var isAvailable: Bool { isConfigured }

    func answer(
        prompt: String,
        systemPrompt: String,
        temperature: Double
    ) async throws -> String {
        guard let apiKey = keyStore.get(providerID: id) else {
            throw LLMProviderError.notConfigured("Add a Groq API key in Settings to use this provider.")
        }

        let url = URL(string: "https://api.groq.com/openai/v1/chat/completions")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "model": model,
            "messages": [
                ["role": "system", "content": systemPrompt],
                ["role": "user", "content": prompt]
            ],
            "temperature": temperature
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw LLMProviderError.transport("Groq: no HTTP response.")
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let message = Self.errorMessage(from: data) ?? "Groq request failed (HTTP \(httpResponse.statusCode))."
            throw LLMProviderError.transport(message)
        }

        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let choices = json["choices"] as? [[String: Any]],
            let first = choices.first,
            let message = first["message"] as? [String: Any],
            let content = message["content"] as? String
        else {
            throw LLMProviderError.malformedResponse("Could not parse Groq response.")
        }

        return content.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Helpers

    private static func errorMessage(from data: Data) -> String? {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let error = json["error"] as? [String: Any],
            let message = error["message"] as? String
        else { return nil }
        return "Groq: \(message)"
    }

    private static func displayName(for model: String) -> String {
        switch model {
        case "llama-3.3-70b-versatile": return "Llama 3.3 70B"
        case "llama-3.1-8b-instant": return "Llama 3.1 8B"
        default: return model
        }
    }
}
