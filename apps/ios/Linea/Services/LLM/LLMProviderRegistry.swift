import Foundation
import SwiftUI

/// Holds the full catalog of chat providers and publishes changes whenever
/// configuration or runtime availability flips.
///
/// Lives on the main actor so SwiftUI views can observe it directly.
@MainActor
final class LLMProviderRegistry: ObservableObject {
    /// All registered providers, in display order.
    @Published private(set) var providers: [LLMProvider]

    /// A monotonically increasing token that views can watch to re-evaluate
    /// derived state (e.g. after an API key is added / removed).
    @Published private(set) var revision: Int = 0

    init(providers: [LLMProvider]? = nil) {
        self.providers = providers ?? Self.defaultProviders()
    }

    /// Providers that are either currently usable (`isAvailable`) or at least
    /// eligible to be used once an API key is added (`isConfigured`).
    ///
    /// This filters out Apple Intelligence on devices where the system model
    /// is not available, and always surfaces remote providers so users can add
    /// their own keys.
    var availableProviders: [LLMProvider] {
        providers.filter { $0.isAvailable || $0.isConfigured }
    }

    /// Providers ready to serve a request right now.
    var usableProviders: [LLMProvider] {
        providers.filter { $0.isAvailable }
    }

    func provider(for id: String) -> LLMProvider? {
        providers.first { $0.id == id }
    }

    /// Re-check availability for every provider. Because our providers compute
    /// `isAvailable` on the fly, we just bump `revision` to prod SwiftUI.
    func refresh() {
        revision &+= 1
    }

    // MARK: - Defaults

    private static func defaultProviders() -> [LLMProvider] {
        [
            AppleLocalProvider(),
            AnthropicProvider(),
            OpenAIProvider(),
            GroqProvider()
        ]
    }
}
