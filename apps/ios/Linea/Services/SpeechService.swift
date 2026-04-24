import AVFoundation
import Foundation
import LineaCore

struct RemoteVoiceProviderStatus: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let available: Bool
    let defaultVoice: String
    let voiceDiscovery: Bool
}

struct RemoteVoice: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let provider: String
    let locale: String?
    let tags: [String]?
    let previewText: String?
    let previewURL: URL?

    enum CodingKeys: String, CodingKey {
        case id
        case label
        case provider
        case locale
        case tags
        case previewText
        case previewURL = "previewUrl"
    }
}

struct RemoteVoiceCapabilities: Decodable {
    let alignment: Bool
}

private struct RemoteVoiceProviderEnvelope: Decodable {
    let providers: [RemoteVoiceProviderStatus]
}

private struct RemoteVoiceEnvelope: Decodable {
    let voices: [RemoteVoice]
}

private struct RemoteCapabilitiesEnvelope: Decodable {
    let capabilities: RemoteVoiceCapabilities
}

private struct RemoteSpeechResponse: Decodable {
    let audioURL: String
    let audioDataBase64: String?

    enum CodingKeys: String, CodingKey {
        case audioURL = "audioUrl"
        case audioDataBase64
    }
}

struct LineaOraClient: Sendable {
    private let configuration: LineaAppConfiguration

    init(configuration: LineaAppConfiguration = .shared) {
        self.configuration = configuration
    }

    func fetchProviders(baseURL: URL, authToken: String? = nil) async throws -> [RemoteVoiceProviderStatus] {
        let (data, _) = try await request(
            path: "api/vox/providers",
            baseURL: baseURL,
            authToken: authToken
        )
        return try JSONDecoder().decode(RemoteVoiceProviderEnvelope.self, from: data).providers
    }

    func fetchVoices(
        provider: String,
        baseURL: URL,
        authToken: String? = nil
    ) async throws -> [RemoteVoice] {
        let (data, _) = try await request(
            path: "api/vox/providers/\(provider)/voices",
            baseURL: baseURL,
            authToken: authToken
        )
        return try JSONDecoder().decode(RemoteVoiceEnvelope.self, from: data).voices
    }

    func fetchCapabilities(baseURL: URL, authToken: String? = nil) async throws -> RemoteVoiceCapabilities {
        let (data, _) = try await request(
            path: "api/vox/capabilities",
            baseURL: baseURL,
            authToken: authToken
        )
        return try JSONDecoder().decode(RemoteCapabilitiesEnvelope.self, from: data).capabilities
    }

    func synthesize(
        text: String,
        provider: String,
        voice: String,
        baseURL: URL,
        authToken: String? = nil
    ) async throws -> Data {
        let payload = [
            "provider": provider,
            "voice": voice,
            "text": text
        ]

        let body = try JSONSerialization.data(withJSONObject: payload)
        let (data, _) = try await request(
            path: "api/vox/synthesize",
            method: "POST",
            body: body,
            baseURL: baseURL,
            authToken: authToken
        )

        let response = try JSONDecoder().decode(RemoteSpeechResponse.self, from: data)
        if let inlineAudio = response.audioDataBase64,
           let audioData = Data(base64Encoded: inlineAudio) {
            return audioData
        }

        let audioURL = URL(string: response.audioURL, relativeTo: baseURL) ?? configuration.baseURL
        let (audioData, _) = try await URLSession.shared.data(from: audioURL)
        return audioData
    }

    private func request(
        path: String,
        method: String = "GET",
        body: Data? = nil,
        baseURL: URL,
        authToken: String? = nil
    ) async throws -> (Data, URLResponse) {
        let resolvedURL = baseURL.appending(path: path)
        var request = URLRequest(url: resolvedURL)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = 60

        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        if let authToken, !authToken.isEmpty {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "The Linea voice request failed."
            throw NSError(
                domain: "LineaOraClient",
                code: (response as? HTTPURLResponse)?.statusCode ?? -1,
                userInfo: [NSLocalizedDescriptionKey: message]
            )
        }

        return (data, response)
    }
}

@MainActor
final class SpeechService: NSObject, ObservableObject, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate {
    static let shared = SpeechService()

    @Published private(set) var isSpeaking = false
    @Published private(set) var activeDocumentID: UUID?
    @Published private(set) var activeSectionID: UUID?
    @Published var lastErrorMessage: String?

    private let synthesizer = AVSpeechSynthesizer()
    private let remoteClient = LineaOraClient()
    private var audioPlayer: AVAudioPlayer?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(
        document: ReadableDocument,
        startingAt section: DocumentSection?,
        settings: LineaSettings,
        authToken: String?
    ) async {
        do {
            try configureAudioSession()

            if settings.speechMode == .remote {
                try await speakRemotely(
                    document: document,
                    startingAt: section,
                    settings: settings,
                    authToken: authToken
                )
            } else {
                speakOnDevice(document: document, startingAt: section)
            }
        } catch {
            lastErrorMessage = error.localizedDescription
        }
    }

    func pauseOrResume() {
        if synthesizer.isSpeaking {
            synthesizer.pauseSpeaking(at: .word)
            isSpeaking = false
            return
        }

        if synthesizer.isPaused {
            synthesizer.continueSpeaking()
            isSpeaking = true
            return
        }

        if let audioPlayer {
            if audioPlayer.isPlaying {
                audioPlayer.pause()
                isSpeaking = false
            } else {
                audioPlayer.play()
                isSpeaking = true
            }
        }
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        audioPlayer?.stop()
        audioPlayer = nil
        isSpeaking = false
        activeDocumentID = nil
        activeSectionID = nil
    }

    private func speakOnDevice(document: ReadableDocument, startingAt section: DocumentSection?) {
        stop()

        let sectionText = section?.text ?? document.sections.first?.text ?? document.fullText
        let utterance = AVSpeechUtterance(string: sectionText)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.93
        utterance.prefersAssistiveTechnologySettings = true

        activeDocumentID = document.id
        activeSectionID = section?.id
        isSpeaking = true
        synthesizer.speak(utterance)
    }

    private func speakRemotely(
        document: ReadableDocument,
        startingAt section: DocumentSection?,
        settings: LineaSettings,
        authToken: String?
    ) async throws {
        stop()

        let text = (section?.text ?? document.sections.first?.text ?? document.fullText)
            .normalizedDocumentText

        let data = try await remoteClient.synthesize(
            text: text,
            provider: settings.remoteProvider,
            voice: settings.remoteVoice,
            baseURL: settings.effectiveBaseURL,
            authToken: authToken
        )

        let player = try AVAudioPlayer(data: data)
        player.delegate = self
        player.prepareToPlay()
        player.play()

        audioPlayer = player
        activeDocumentID = document.id
        activeSectionID = section?.id
        isSpeaking = true
    }

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true, options: [])
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            self.isSpeaking = false
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            self.isSpeaking = false
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isSpeaking = false
        }
    }
}
