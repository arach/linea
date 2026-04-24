import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var library: DocumentLibrary
    @EnvironmentObject private var importer: DocumentImporter
    @Environment(\.lineaTheme) private var theme

    @State private var selectedDocumentID: UUID?
    @State private var showingFileImporter = false
    @State private var showingURLImport = false
    @State private var showingScanner = false
    @State private var showingSettings = false
    @State private var importErrorMessage: String?

    var body: some View {
        NavigationStack {
            LibraryHomeView(
                openDocument: { id in selectedDocumentID = id },
                importFile: { showingFileImporter = true },
                importURL: { showingURLImport = true },
                scanPages: { showingScanner = true },
                openSettings: { showingSettings = true }
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $selectedDocumentID) { id in
                ReaderView(documentID: id)
            }
        }
        .tint(theme.palette.ink)
        .fileImporter(
            isPresented: $showingFileImporter,
            allowedContentTypes: [.pdf, .image, .text],
            allowsMultipleSelection: false,
            onCompletion: handleFileImport
        )
        .sheet(isPresented: $showingURLImport) {
            URLImportSheet { rawURL in
                showingURLImport = false
                Task { await importURL(rawURL) }
            }
        }
        .sheet(isPresented: $showingScanner) {
            DocumentScannerView(
                onComplete: { images in
                    showingScanner = false
                    Task { await importScannedImages(images) }
                },
                onFailure: { message in
                    showingScanner = false
                    importErrorMessage = message
                }
            )
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView()
        }
        .overlay(alignment: .bottom) {
            if let activityLabel = importer.activityLabel {
                ProgressView(activityLabel)
                    .font(theme.typography.ui.font(size: 13))
                    .foregroundStyle(theme.palette.inkSoft)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(theme.palette.lift, in: Capsule())
                    .overlay(Capsule().stroke(theme.palette.rule, lineWidth: theme.metrics.hairline))
                    .padding(.bottom, 18)
            }
        }
        .alert(
            "Import failed",
            isPresented: Binding(
                get: { importErrorMessage != nil },
                set: { if !$0 { importErrorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(importErrorMessage ?? "")
        }
    }

    private func handleFileImport(_ result: Result<[URL], Error>) {
        do {
            guard let fileURL = try result.get().first else { return }
            let isScoped = fileURL.startAccessingSecurityScopedResource()

            Task {
                defer {
                    if isScoped {
                        fileURL.stopAccessingSecurityScopedResource()
                    }
                }

                do {
                    let document = try await importer.importFile(at: fileURL)
                    selectedDocumentID = document.id
                } catch {
                    importErrorMessage = error.localizedDescription
                }
            }
        } catch {
            importErrorMessage = error.localizedDescription
        }
    }

    private func importURL(_ rawURL: String) async {
        let trimmed = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let candidate = trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
            ? trimmed
            : "https://\(trimmed)"

        guard let url = URL(string: candidate) else {
            importErrorMessage = "Enter a valid URL."
            return
        }

        do {
            let document = try await importer.importURL(url)
            selectedDocumentID = document.id
        } catch {
            importErrorMessage = error.localizedDescription
        }
    }

    private func importScannedImages(_ images: [UIImage]) async {
        do {
            let document = try await importer.importImages(images, title: "Scanned document")
            selectedDocumentID = document.id
        } catch {
            importErrorMessage = error.localizedDescription
        }
    }
}

private struct URLImportSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.lineaTheme) private var theme
    @State private var urlString = ""
    @FocusState private var focused: Bool

    let onSubmit: (String) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section("URL") {
                    TextField("https://example.com/article", text: $urlString)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .focused($focused)
                }
            }
            .navigationTitle("Import URL")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") {
                        onSubmit(urlString)
                    }
                    .disabled(urlString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                focused = true
            }
        }
        .tint(theme.palette.ink)
    }
}
