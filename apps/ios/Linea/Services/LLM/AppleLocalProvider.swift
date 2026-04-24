import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/// On-device chat backed by Apple FoundationModels.
///
/// Eligible on iOS 26+ devices with Apple Intelligence enabled.
/// No API key required — `isConfigured` is always `true`. Runtime availability
/// is surfaced via `isAvailable`, which reflects `SystemLanguageModel.default.availability`.
final class AppleLocalProvider: LLMProvider {
    let id = "appleLocal"
    let label = "Apple Intelligence"
    let modelLabel = "On-device model"

    let isConfigured = true

    var isAvailable: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return true
            default:
                return false
            }
        } else {
            return false
        }
        #else
        return false
        #endif
    }

    func answer(
        prompt: String,
        systemPrompt: String,
        temperature: Double
    ) async throws -> String {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            guard isAvailable else {
                throw LLMProviderError.notAvailable("Apple Intelligence is not available on this device.")
            }

            let session = LanguageModelSession(instructions: systemPrompt)
            let response = try await session.respond(
                to: prompt,
                options: FoundationModels.GenerationOptions(temperature: temperature)
            )
            return response.content.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            throw LLMProviderError.notAvailable("On-device chat requires iOS 26 or later.")
        }
        #else
        throw LLMProviderError.notAvailable("Foundation Models are not available in this SDK.")
        #endif
    }
}
