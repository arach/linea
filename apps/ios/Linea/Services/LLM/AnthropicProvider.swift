import Foundation

/// Anthropic Claude messages provider. Defaults to `claude-3-5-haiku-latest`.
final class AnthropicProvider: LLMProvider {
    let id = "anthropic"
    let label = "Anthropic"
    let modelLabel: String
    private let model: String
    private let keyStore: APIKeyStore
    private let maxTokens: Int

    init(
        model: String = "claude-3-5-haiku-latest",
        maxTokens: Int = 1024,
        keyStore: APIKeyStore = .shared
    ) {
        self.model = model
        self.modelLabel = Self.displayName(for: model)
        self.keyStore = keyStore
        self.maxTokens = maxTokens
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
            throw LLMProviderError.notConfigured("Add an Anthropic API key in Settings to use this provider.")
        }

        let url = URL(string: "https://api.anthropic.com/v1/messages")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": model,
            "system": systemPrompt,
            "messages": [
                ["role": "user", "content": prompt]
            ],
            "temperature": temperature,
            "max_tokens": maxTokens
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw LLMProviderError.transport("Anthropic: no HTTP response.")
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let message = Self.errorMessage(from: data) ?? "Anthropic request failed (HTTP \(httpResponse.statusCode))."
            throw LLMProviderError.transport(message)
        }

        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let content = json["content"] as? [[String: Any]],
            let first = content.first,
            let text = first["text"] as? String
        else {
            throw LLMProviderError.malformedResponse("Could not parse Anthropic response.")
        }

        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: - Helpers

    private static func errorMessage(from data: Data) -> String? {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let error = json["error"] as? [String: Any],
            let message = error["message"] as? String
        else { return nil }
        return "Anthropic: \(message)"
    }

    private static func displayName(for model: String) -> String {
        switch model {
        case "claude-3-5-haiku-latest": return "Claude 3.5 Haiku"
        case "claude-3-5-sonnet-latest": return "Claude 3.5 Sonnet"
        default: return model
        }
    }
}
