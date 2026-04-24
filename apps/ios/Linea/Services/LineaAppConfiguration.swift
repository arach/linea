import Foundation

struct LineaAppConfiguration: Sendable {
    static let shared = LineaAppConfiguration()

    let baseURL: URL
    let clerkPublishableKey: String
    let defaultRemoteProvider: String
    let defaultRemoteVoice: String
    let appGroupIdentifier: String

    init(bundle: Bundle = .main) {
        let configuredBaseURL = bundle.object(forInfoDictionaryKey: "LINEA_BASE_URL") as? String
        let trimmedBaseURL = configuredBaseURL?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let fallbackBaseURL = {
            #if DEBUG
            return "http://127.0.0.1:5173"
            #else
            return "https://uselinea.com"
            #endif
        }()

        self.baseURL = URL(string: trimmedBaseURL.isEmpty ? fallbackBaseURL : trimmedBaseURL)
            ?? URL(string: fallbackBaseURL)!
        self.clerkPublishableKey = (bundle.object(forInfoDictionaryKey: "LINEA_CLERK_PUBLISHABLE_KEY") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.defaultRemoteProvider = (bundle.object(forInfoDictionaryKey: "LINEA_DEFAULT_REMOTE_PROVIDER") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? "openai"
        self.defaultRemoteVoice = (bundle.object(forInfoDictionaryKey: "LINEA_DEFAULT_REMOTE_VOICE") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? "alloy"
        self.appGroupIdentifier = (bundle.object(forInfoDictionaryKey: "LINEA_APP_GROUP_IDENTIFIER") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? "group.com.uselinea.reader"
    }
}
