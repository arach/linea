import SwiftUI

@main
struct LineaApp: App {
    @StateObject private var library: DocumentLibrary
    @StateObject private var importer: DocumentImporter
    @StateObject private var settings: LineaSettings
    @StateObject private var speech: SpeechService
    @StateObject private var auth: AuthManager
    @StateObject private var providerRegistry: LLMProviderRegistry
    @StateObject private var chatService: DocumentChatService
    @StateObject private var themeManager: ThemeManager
    @State private var showSplash = true

    init() {
        let library = DocumentLibrary()
        let importer = DocumentImporter(library: library)
        let settings = LineaSettings.shared
        let speech = SpeechService.shared
        let auth = AuthManager.shared
        let providerRegistry = LLMProviderRegistry()
        let chatService = DocumentChatService(registry: providerRegistry, settings: settings)
        let themeManager = ThemeManager(initial: settings.themeID)

        auth.configureIfNeeded()

        _library = StateObject(wrappedValue: library)
        _importer = StateObject(wrappedValue: importer)
        _settings = StateObject(wrappedValue: settings)
        _speech = StateObject(wrappedValue: speech)
        _auth = StateObject(wrappedValue: auth)
        _providerRegistry = StateObject(wrappedValue: providerRegistry)
        _chatService = StateObject(wrappedValue: chatService)
        _themeManager = StateObject(wrappedValue: themeManager)
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if showSplash {
                    SplashView()
                } else {
                    ContentView()
                        .environmentObject(library)
                        .environmentObject(importer)
                        .environmentObject(settings)
                        .environmentObject(speech)
                        .environmentObject(auth)
                        .environmentObject(providerRegistry)
                        .environmentObject(chatService)
                        .environmentObject(themeManager)
                }
            }
            .lineaTheme(themeManager.theme)
            .preferredColorScheme(settings.preferredColorScheme ?? themeManager.theme.preferredColorScheme)
            .onChange(of: settings.themeID) { _, newID in
                themeManager.apply(newID)
            }
            .task {
                guard showSplash else { return }
                try? await Task.sleep(for: .milliseconds(700))
                withAnimation(.easeOut(duration: 0.2)) {
                    showSplash = false
                }
            }
        }
    }
}
