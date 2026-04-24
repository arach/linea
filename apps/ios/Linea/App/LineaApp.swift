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
    @StateObject private var extractionService: PDFExtractionService
    private let pageTextStore: PageTextStore
    @State private var showSplash = true

    init() {
        let library = DocumentLibrary()
        let pageTextStore = PageTextStore()
        let extractionService = PDFExtractionService(library: library, pageStore: pageTextStore)
        let importer = DocumentImporter(library: library, extractionService: extractionService)
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
        _extractionService = StateObject(wrappedValue: extractionService)
        self.pageTextStore = pageTextStore
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
                        .environmentObject(extractionService)
                        .environment(\.pageTextStore, pageTextStore)
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
