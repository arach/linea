import Foundation
import UIKit
import UniformTypeIdentifiers

@MainActor
final class DocumentImporter: ObservableObject {
    @Published private(set) var activityLabel: String?
    @Published private(set) var lastErrorMessage: String?

    let library: DocumentLibrary
    private weak var extractionService: PDFExtractionService?

    init(library: DocumentLibrary, extractionService: PDFExtractionService? = nil) {
        self.library = library
        self.extractionService = extractionService
    }

    func attachExtractionService(_ service: PDFExtractionService) {
        self.extractionService = service
    }

    var isImporting: Bool {
        activityLabel != nil
    }

    func importPDF(from fileURL: URL) async throws -> ReadableDocument {
        begin("Importing PDF")
        do {
            let metadata = try PDFImportService.readMetadata(from: fileURL)

            var document = ReadableDocument(
                title: metadata.title,
                sourceKind: .pdf,
                sourceURL: fileURL.absoluteString,
                sections: [],
                fullText: "",
                pageCount: metadata.pageCount,
                extractionComplete: false
            )

            document.pageAssets.append(
                try library.stageImportedFile(at: fileURL, for: document.id)
            )

            if let previewImageData = metadata.previewImageData {
                document.pageAssets.append(
                    try library.saveData(
                        previewImageData,
                        fileName: "preview.jpg",
                        for: document.id,
                        kind: .previewImage
                    )
                )
            }

            library.upsert(document)
            finish()

            if let extractionService,
               let stagedAsset = document.pageAssets.first(where: { $0.kind == .sourceFile }) {
                let stagedURL = library.absoluteURL(for: stagedAsset)
                extractionService.startExtraction(
                    documentID: document.id,
                    pdfURL: stagedURL,
                    pageCount: metadata.pageCount
                )
            }

            return document
        } catch {
            finish(error: error)
            throw error
        }
    }

    func importURL(_ url: URL) async throws -> ReadableDocument {
        begin("Extracting page")
        do {
            let content = try await URLImportService.extract(from: url)
            let text = content.text.normalizedDocumentText
            let draft = ImportedDocumentDraft(
                title: content.title ?? url.host(percentEncoded: false) ?? "Saved page",
                sourceKind: .url,
                sourceURL: url,
                sections: DocumentSectionBuilder.buildSections(from: text, preferredTitle: content.title),
                fullText: text,
                previewImageData: nil
            )
            let document = try persist(draft: draft, sourceFileURL: nil)
            finish()
            return document
        } catch {
            finish(error: error)
            throw error
        }
    }

    func importImages(_ images: [UIImage], title: String? = nil) async throws -> ReadableDocument {
        begin(images.count > 1 ? "Scanning pages" : "Importing image")
        do {
            let ocr = try await OCRService.extractText(from: images)
            let resolvedTitle = title ?? (images.count > 1 ? "Scanned document" : "Imported image")
            let draft = ImportedDocumentDraft(
                title: resolvedTitle,
                sourceKind: images.count > 1 ? .scan : .image,
                sourceURL: nil,
                sections: DocumentSectionBuilder.buildSections(from: ocr.text, preferredTitle: resolvedTitle),
                fullText: ocr.text,
                previewImageData: ocr.previewImageData
            )
            let document = try persist(draft: draft, sourceFileURL: nil, supplementalImages: images)
            finish()
            return document
        } catch {
            finish(error: error)
            throw error
        }
    }

    func importImageFile(at fileURL: URL) async throws -> ReadableDocument {
        guard let image = UIImage(contentsOfFile: fileURL.path) else {
            throw CocoaError(.fileReadCorruptFile)
        }

        return try await importImages(
            [image],
            title: fileURL.deletingPathExtension().lastPathComponent
        )
    }

    func importTextFile(at fileURL: URL) async throws -> ReadableDocument {
        begin("Importing text")
        do {
            let data = try Data(contentsOf: fileURL)
            let text = (
                String(data: data, encoding: .utf8)
                ?? String(data: data, encoding: .unicode)
                ?? String(data: data, encoding: .ascii)
                ?? ""
            ).normalizedDocumentText
            let title = fileURL.deletingPathExtension().lastPathComponent
            let draft = ImportedDocumentDraft(
                title: title,
                sourceKind: .text,
                sourceURL: fileURL,
                sections: DocumentSectionBuilder.buildSections(from: text, preferredTitle: title),
                fullText: text,
                previewImageData: nil
            )
            let document = try persist(draft: draft, sourceFileURL: fileURL)
            finish()
            return document
        } catch {
            finish(error: error)
            throw error
        }
    }

    func importFile(at fileURL: URL) async throws -> ReadableDocument {
        let values = try fileURL.resourceValues(forKeys: [.contentTypeKey])
        let contentType = values.contentType

        if contentType?.conforms(to: .pdf) == true {
            return try await importPDF(from: fileURL)
        }

        if contentType?.conforms(to: .image) == true {
            return try await importImageFile(at: fileURL)
        }

        if contentType?.conforms(to: .text) == true || contentType == nil {
            return try await importTextFile(at: fileURL)
        }

        throw CocoaError(.fileReadUnknown)
    }

    private func persist(
        draft: ImportedDocumentDraft,
        sourceFileURL: URL?,
        supplementalImages: [UIImage] = []
    ) throws -> ReadableDocument {
        var document = ReadableDocument(
            title: draft.title,
            sourceKind: draft.sourceKind,
            sourceURL: draft.sourceURL?.absoluteString,
            sections: draft.sections,
            fullText: draft.fullText
        )

        if let sourceFileURL {
            document.pageAssets.append(
                try library.stageImportedFile(
                    at: sourceFileURL,
                    for: document.id
                )
            )
        }

        if let previewImageData = draft.previewImageData {
            document.pageAssets.append(
                try library.saveData(
                    previewImageData,
                    fileName: "preview.jpg",
                    for: document.id,
                    kind: .previewImage
                )
            )
        }

        for (index, image) in supplementalImages.enumerated() {
            document.pageAssets.append(
                try library.saveImage(
                    image,
                    for: document.id,
                    suggestedName: "scan-\(index + 1).png",
                    kind: .scannedPage
                )
            )
        }

        library.upsert(document)
        return document
    }

    private func begin(_ label: String) {
        activityLabel = label
        lastErrorMessage = nil
    }

    private func finish(error: Error? = nil) {
        activityLabel = nil
        if let error {
            lastErrorMessage = error.localizedDescription
        }
    }
}
