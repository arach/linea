import Foundation
import PDFKit
import UIKit

enum PDFImportService {
    enum PDFImportError: LocalizedError {
        case unreadableFile
        case noTextExtracted

        var errorDescription: String? {
            switch self {
            case .unreadableFile:
                return "That PDF could not be opened."
            case .noTextExtracted:
                return "No readable text was extracted from that PDF."
            }
        }
    }

    static func importDocument(from fileURL: URL) async throws -> ImportedDocumentDraft {
        guard let pdfDocument = PDFDocument(url: fileURL), pdfDocument.pageCount > 0 else {
            throw PDFImportError.unreadableFile
        }

        var sections: [DocumentSection] = []
        var pageTexts: [String] = []
        var previewImageData: Data?

        for pageIndex in 0..<pdfDocument.pageCount {
            guard let page = pdfDocument.page(at: pageIndex) else { continue }

            let pageNumber = pageIndex + 1
            var pageText = (page.string ?? "").normalizedDocumentText

            if pageText.isEmpty {
                let previewImage = page.thumbnail(of: CGSize(width: 1200, height: 1600), for: .cropBox)
                if previewImageData == nil {
                    previewImageData = previewImage.jpegData(compressionQuality: 0.82)
                }

                if let ocr = try? await OCRService.extractText(from: previewImage) {
                    pageText = ocr.text
                    if previewImageData == nil {
                        previewImageData = ocr.previewImageData
                    }
                }
            }

            guard !pageText.isEmpty else { continue }

            pageTexts.append(pageText)
            sections.append(
                contentsOf: DocumentSectionBuilder.buildSections(
                    from: pageText,
                    pageNumber: pageNumber,
                    preferredTitle: pageNumber == 1 ? "Opening" : nil
                )
            )
        }

        let fullText = pageTexts.joined(separator: "\n\n").normalizedDocumentText
        guard !fullText.isEmpty else {
            throw PDFImportError.noTextExtracted
        }

        let title = (pdfDocument.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackTitle = fileURL.deletingPathExtension().lastPathComponent

        return ImportedDocumentDraft(
            title: (title?.isEmpty == false ? title : nil) ?? fallbackTitle,
            sourceKind: .pdf,
            sourceURL: fileURL,
            sections: sections.isEmpty ? DocumentSectionBuilder.buildSections(from: fullText) : sections,
            fullText: fullText,
            previewImageData: previewImageData
        )
    }
}
