import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.lineaTheme) private var theme
    @EnvironmentObject private var settings: LineaSettings
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var chatService: DocumentChatService

    @State private var providers: [RemoteVoiceProviderStatus] = []
    @State private var voices: [RemoteVoice] = []
    @State private var remoteMessage: String?
    @State private var isLoadingRemoteSettings = false

    private let remoteClient = LineaOraClient()

    var body: some View {
        NavigationStack {
            Form {
                themeSection
                appearanceSection
                audioSection
                remoteSection
                chatSection
                accountSection
            }
            .scrollContentBackground(.hidden)
            .background(theme.palette.paperDim.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(theme.palette.ink)
                }
            }
            .task {
                await chatService.refreshAvailability()
                await refreshRemoteSettings()
            }
            .onChange(of: settings.remoteProvider) { _, _ in
                Task {
                    do {
                        try await loadVoices()
                    } catch {
                        remoteMessage = error.localizedDescription
                    }
                }
            }
        }
        .tint(theme.palette.ink)
    }

    // MARK: - Theme

    private var themeSection: some View {
        Section {
            ForEach(LineaThemeID.allCases) { id in
                Button {
                    settings.themeID = id
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        themeSwatch(for: id)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(id.label)
                                    .font(theme.typography.display.font(size: 17, weight: .regular))
                                    .foregroundStyle(theme.palette.ink)
                                Spacer()
                                if settings.themeID == id {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(theme.palette.ink)
                                }
                            }
                            Text(id.blurb)
                                .font(theme.typography.serif.font(size: 13, weight: .regular, italic: true))
                                .foregroundStyle(theme.palette.inkSoft)
                        }
                    }
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        } header: {
            ThemedEyebrow(text: "Theme")
        } footer: {
            Text("Themes are token-driven — every colour and type choice in the app reads from one palette, so new directions can be added by dropping in a theme file.")
                .font(theme.typography.ui.font(size: 11))
                .foregroundStyle(theme.palette.inkMuted)
        }
        .listRowBackground(theme.palette.paper)
    }

    private func themeSwatch(for id: LineaThemeID) -> some View {
        let candidate = LineaThemeRegistry.theme(for: id)
        return ZStack {
            candidate.palette.paper
            HStack(spacing: 0) {
                candidate.palette.paperDim
                    .frame(width: 12)
                candidate.palette.lift
                    .frame(width: 12)
            }
            .frame(maxWidth: .infinity, alignment: .trailing)

            Text(String(id.shortLabel.prefix(1)))
                .font(candidate.typography.display.font(size: 16, weight: .regular, italic: true))
                .foregroundStyle(candidate.palette.ink)
        }
        .frame(width: 54, height: 54)
        .overlay(
            Rectangle().stroke(candidate.palette.rule, lineWidth: 1)
        )
    }

    // MARK: - Other sections

    private var appearanceSection: some View {
        Section {
            Picker("Mode", selection: $settings.appearance) {
                ForEach(LineaSettings.Appearance.allCases) { appearance in
                    Text(appearance.rawValue.capitalized).tag(appearance)
                }
            }
        } header: {
            ThemedEyebrow(text: "Appearance")
        }
        .listRowBackground(theme.palette.paper)
    }

    private var audioSection: some View {
        Section {
            Picker("Playback", selection: $settings.speechMode) {
                ForEach(LineaSettings.SpeechMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
        } header: {
            ThemedEyebrow(text: "Reading Audio")
        }
        .listRowBackground(theme.palette.paper)
    }

    private var remoteSection: some View {
        Section {
            TextField("Base URL", text: $settings.customBaseURL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)

            if !providers.isEmpty {
                Picker("Provider", selection: $settings.remoteProvider) {
                    ForEach(providers, id: \.id) { provider in
                        Text(provider.label).tag(provider.id)
                    }
                }
            }

            if !voices.isEmpty {
                Picker("Voice", selection: $settings.remoteVoice) {
                    ForEach(voices, id: \.id) { voice in
                        Text(voice.label).tag(voice.id)
                    }
                }
            }

            Button("Refresh Remote Voices") {
                Task { await refreshRemoteSettings() }
            }
            .disabled(isLoadingRemoteSettings)
            .foregroundStyle(theme.palette.ink)

            if let remoteMessage {
                Text(remoteMessage)
                    .font(theme.typography.ui.font(size: 11))
                    .foregroundStyle(theme.palette.inkSoft)
            }
        } header: {
            ThemedEyebrow(text: "Linea Ora")
        }
        .listRowBackground(theme.palette.paper)
    }

    private var chatSection: some View {
        Section {
            Text(chatService.isAvailable ? "On-device chat is available." : chatService.availabilityReason)
                .font(theme.typography.serif.font(size: 13, weight: .regular, italic: true))
                .foregroundStyle(theme.palette.inkSoft)
            Button("Refresh Availability") {
                Task { await chatService.refreshAvailability() }
            }
            .foregroundStyle(theme.palette.ink)
        } header: {
            ThemedEyebrow(text: "Document Chat")
        }
        .listRowBackground(theme.palette.paper)
    }

    private var accountSection: some View {
        Section {
            if auth.isConfigured {
                if auth.isSignedIn {
                    Text(auth.userEmail ?? "Signed in")
                        .foregroundStyle(theme.palette.ink)
                    Button("Sign Out", role: .destructive) {
                        auth.signOut()
                    }
                } else {
                    Button("Sign In with Apple") {
                        Task {
                            do {
                                try await auth.signIn()
                            } catch {
                                remoteMessage = error.localizedDescription
                            }
                        }
                    }
                    .foregroundStyle(theme.palette.ink)
                }

                if auth.isLoading {
                    ForEach(auth.authSteps) { step in
                        HStack {
                            Text(step.name)
                                .foregroundStyle(theme.palette.ink)
                            Spacer()
                            Text(statusLabel(for: step.status))
                                .font(theme.typography.ui.font(size: 11))
                                .foregroundStyle(theme.palette.inkMuted)
                        }
                    }
                }
            } else {
                Text("Clerk is not configured in this build yet.")
                    .font(theme.typography.serif.font(size: 13, weight: .regular, italic: true))
                    .foregroundStyle(theme.palette.inkSoft)
            }
        } header: {
            ThemedEyebrow(text: "Account")
        }
        .listRowBackground(theme.palette.paper)
    }

    // MARK: - Remote

    private func refreshRemoteSettings() async {
        isLoadingRemoteSettings = true
        defer { isLoadingRemoteSettings = false }

        do {
            let token = await auth.authToken
            providers = try await remoteClient.fetchProviders(
                baseURL: settings.effectiveBaseURL,
                authToken: token
            )

            if providers.contains(where: { $0.id == settings.remoteProvider }) == false {
                settings.remoteProvider = providers.first?.id ?? settings.remoteProvider
            }

            try await loadVoices()

            let capabilities = try? await remoteClient.fetchCapabilities(
                baseURL: settings.effectiveBaseURL,
                authToken: token
            )
            remoteMessage = capabilities?.alignment == true
                ? "Linea Ora is reachable and alignment is available."
                : "Linea Ora is reachable."
        } catch {
            remoteMessage = error.localizedDescription
            providers = []
            voices = []
        }
    }

    private func loadVoices() async throws {
        let token = await auth.authToken
        voices = try await remoteClient.fetchVoices(
            provider: settings.remoteProvider,
            baseURL: settings.effectiveBaseURL,
            authToken: token
        )

        if voices.contains(where: { $0.id == settings.remoteVoice }) == false {
            settings.remoteVoice = voices.first?.id ?? settings.remoteVoice
        }
    }

    private func statusLabel(for status: AuthStep.Status) -> String {
        switch status {
        case .pending: "Pending"
        case .inProgress: "Working"
        case .completed: "Done"
        case .failed: "Failed"
        }
    }
}
