import Foundation
import LineaCore
import UIKit

@MainActor
final class DocumentLibrary: ObservableObject {
    @Published private(set) var documents: [ReadableDocument] = []

    private let fileManager: FileManager
    private let storageRootURL: URL
    private let archiveURL: URL

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager

        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? "com.uselinea.reader"
        self.storageRootURL = appSupport.appendingPathComponent(bundleIdentifier, isDirectory: true)
        self.archiveURL = storageRootURL.appendingPathComponent("library.json")

        ensureStorage()
        load()
    }

    func document(id: ReadableDocument.ID) -> ReadableDocument? {
        documents.first(where: { $0.id == id })
    }

    func upsert(_ document: ReadableDocument) {
        if let existingIndex = documents.firstIndex(where: { $0.id == document.id }) {
            documents[existingIndex] = document
        } else {
            documents.append(document)
        }

        sortDocuments()
        persist()
    }

    func remove(documentID: ReadableDocument.ID) {
        documents.removeAll { $0.id == documentID }
        let folderURL = storageRootURL.appendingPathComponent(documentID.uuidString, isDirectory: true)
        try? fileManager.removeItem(at: folderURL)
        persist()
    }

    /// Persist the latest extraction progress for a document. Called from
    /// `PDFExtractionService` as pages land and when extraction completes.
    func updateExtractionState(
        documentID: UUID,
        pageCount: Int,
        sections: [DocumentSection],
        complete: Bool
    ) {
        guard let index = documents.firstIndex(where: { $0.id == documentID }) else { return }
        var document = documents[index]
        document.pageCount = pageCount
        if !sections.isEmpty {
            document.sections = sections
        }
        document.extractionComplete = complete
        document.updatedAt = .now
        documents[index] = document
        sortDocuments()
        persist()
    }

    func markOpened(documentID: ReadableDocument.ID) {
        guard let index = documents.firstIndex(where: { $0.id == documentID }) else { return }
        documents[index].lastOpenedAt = .now
        documents[index].updatedAt = .now
        sortDocuments()
        persist()
    }

    @discardableResult
    func appendConversationTurn(
        documentID: ReadableDocument.ID,
        threadID: DocumentConversationThread.ID?,
        title: String,
        turn: DocumentConversationTurn
    ) -> DocumentConversationThread? {
        guard let documentIndex = documents.firstIndex(where: { $0.id == documentID }) else {
            return nil
        }

        var document = documents[documentIndex]
        let resolvedThreadID = threadID ?? document.conversationThreads.first?.id ?? UUID()

        if let threadIndex = document.conversationThreads.firstIndex(where: { $0.id == resolvedThreadID }) {
            document.conversationThreads[threadIndex].turns.append(turn)
            document.conversationThreads[threadIndex].updatedAt = .now
        } else {
            var newThread = DocumentConversationThread(id: resolvedThreadID, title: title)
            newThread.turns = [turn]
            document.conversationThreads.insert(newThread, at: 0)
        }

        document.updatedAt = .now
        documents[documentIndex] = document
        sortDocuments()
        persist()

        return documents[documentIndex].conversationThreads.first(where: { $0.id == resolvedThreadID })
    }

    func saveImage(
        _ image: UIImage,
        for documentID: UUID,
        suggestedName: String,
        kind: ImportedAsset.Kind
    ) throws -> ImportedAsset {
        guard let data = image.pngData() else {
            throw CocoaError(.coderInvalidValue)
        }

        return try saveData(
            data,
            fileName: suggestedName,
            for: documentID,
            kind: kind
        )
    }

    func saveData(
        _ data: Data,
        fileName: String,
        for documentID: UUID,
        kind: ImportedAsset.Kind
    ) throws -> ImportedAsset {
        let documentFolder = folderURL(for: documentID)
        try fileManager.createDirectory(
            at: documentFolder,
            withIntermediateDirectories: true,
            attributes: nil
        )

        let destinationURL = documentFolder.appendingPathComponent(fileName)
        try data.write(to: destinationURL, options: .atomic)

        return ImportedAsset(
            kind: kind,
            relativePath: "\(documentID.uuidString)/\(fileName)"
        )
    }

    func stageImportedFile(
        at sourceURL: URL,
        for documentID: UUID,
        preferredName: String? = nil
    ) throws -> ImportedAsset {
        let fileName = preferredName ?? sourceURL.lastPathComponent
        let data = try Data(contentsOf: sourceURL)
        return try saveData(data, fileName: fileName, for: documentID, kind: .sourceFile)
    }

    func absoluteURL(for asset: ImportedAsset) -> URL {
        storageRootURL.appendingPathComponent(asset.relativePath)
    }

    private func folderURL(for documentID: UUID) -> URL {
        storageRootURL.appendingPathComponent(documentID.uuidString, isDirectory: true)
    }

    private func ensureStorage() {
        try? fileManager.createDirectory(
            at: storageRootURL,
            withIntermediateDirectories: true,
            attributes: nil
        )
    }

    private func load() {
        guard fileManager.fileExists(atPath: archiveURL.path) else {
            documents = []
            return
        }

        do {
            let data = try Data(contentsOf: archiveURL)
            documents = try JSONDecoder().decode([ReadableDocument].self, from: data)
            sortDocuments()
        } catch {
            documents = []
        }
    }

    private func persist() {
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(documents)
            try data.write(to: archiveURL, options: .atomic)
        } catch {
            assertionFailure("Failed to persist Linea document library: \(error)")
        }
    }

    private func sortDocuments() {
        documents.sort {
            let leftDate = $0.lastOpenedAt ?? $0.updatedAt
            let rightDate = $1.lastOpenedAt ?? $1.updatedAt
            return leftDate > rightDate
        }
    }
}
