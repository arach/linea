import Foundation
import SwiftUI

@MainActor
final class LineaSettings: ObservableObject {
    enum Appearance: String, CaseIterable, Identifiable {
        case system
        case light
        case dark

        var id: String { rawValue }
    }

    enum SpeechMode: String, CaseIterable, Identifiable {
        case onDevice
        case remote

        var id: String { rawValue }

        var label: String {
            switch self {
            case .onDevice: "On Device"
            case .remote: "Linea Ora"
            }
        }
    }

    static let shared = LineaSettings()

    @Published var appearance: Appearance {
        didSet { defaults.set(appearance.rawValue, forKey: Keys.appearance) }
    }

    @Published var themeID: LineaThemeID {
        didSet { defaults.set(themeID.rawValue, forKey: Keys.themeID) }
    }

    @Published var speechMode: SpeechMode {
        didSet { defaults.set(speechMode.rawValue, forKey: Keys.speechMode) }
    }

    @Published var remoteProvider: String {
        didSet { defaults.set(remoteProvider, forKey: Keys.remoteProvider) }
    }

    @Published var remoteVoice: String {
        didSet { defaults.set(remoteVoice, forKey: Keys.remoteVoice) }
    }

    @Published var customBaseURL: String {
        didSet { defaults.set(customBaseURL, forKey: Keys.customBaseURL) }
    }

    @Published var chatProviderID: String {
        didSet { defaults.set(chatProviderID, forKey: Keys.chatProviderID) }
    }

    var preferredColorScheme: ColorScheme? {
        switch appearance {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    var effectiveBaseURL: URL {
        let trimmed = customBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        return URL(string: trimmed) ?? configuration.baseURL
    }

    private let defaults: UserDefaults
    private let configuration: LineaAppConfiguration

    private enum Keys {
        static let appearance = "linea.appearance"
        static let themeID = "linea.themeID"
        static let speechMode = "linea.speechMode"
        static let remoteProvider = "linea.remoteProvider"
        static let remoteVoice = "linea.remoteVoice"
        static let customBaseURL = "linea.customBaseURL"
        static let chatProviderID = "linea.chatProviderID"
    }

    init(
        defaults: UserDefaults = .standard,
        configuration: LineaAppConfiguration = .shared
    ) {
        self.defaults = defaults
        self.configuration = configuration
        self.appearance = Appearance(rawValue: defaults.string(forKey: Keys.appearance) ?? "") ?? .system
        self.themeID = LineaThemeID(rawValue: defaults.string(forKey: Keys.themeID) ?? "") ?? .monochrome
        // Temporarily pin playback to on-device. Remote TTS (Linea Ora) is
        // hidden from the UI until we ship direct TTS providers or the
        // paired companion app — forcing the value avoids a silently-broken
        // Listen button on devices where the user may have flipped to
        // .remote in an earlier build.
        self.speechMode = .onDevice
        self.remoteProvider = defaults.string(forKey: Keys.remoteProvider) ?? configuration.defaultRemoteProvider
        self.remoteVoice = defaults.string(forKey: Keys.remoteVoice) ?? configuration.defaultRemoteVoice
        self.customBaseURL = defaults.string(forKey: Keys.customBaseURL) ?? configuration.baseURL.absoluteString
        self.chatProviderID = defaults.string(forKey: Keys.chatProviderID) ?? "appleLocal"
    }
}
