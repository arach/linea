import Foundation
import PDFKit
import UIKit

/// Shape of a fast-return PDF import. The heavy work (per-page text
/// extraction, sectioning, OCR) is handed off to `PDFExtractionService`;
/// `importDocument` only opens the PDF, reads metadata, and grabs a
/// first-page preview image.
struct PDFImportMetadata {
    var title: String
    var pageCount: Int
    var previewImageData: Data?
}

enum PDFImportService {
    enum PDFImportError: LocalizedError {
        case unreadableFile

        var errorDescription: String? {
            switch self {
            case .unreadableFile:
                return "That PDF could not be opened."
            }
        }
    }

    /// Fast-return metadata read: page count, title, preview image only. No
    /// text extraction, no OCR. Intended to be called from
    /// `DocumentImporter.importPDF` so the user lands in the reader quickly.
    static func readMetadata(from fileURL: URL) throws -> PDFImportMetadata {
        guard let pdfDocument = PDFDocument(url: fileURL), pdfDocument.pageCount > 0 else {
            throw PDFImportError.unreadableFile
        }

        let title = (pdfDocument.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackTitle = fileURL.deletingPathExtension().lastPathComponent
        let resolvedTitle = (title?.isEmpty == false ? title : nil) ?? fallbackTitle

        var previewImageData: Data?
        if let firstPage = pdfDocument.page(at: 0) {
            let previewImage = firstPage.thumbnail(of: CGSize(width: 1200, height: 1600), for: .cropBox)
            previewImageData = previewImage.jpegData(compressionQuality: 0.82)
        }

        return PDFImportMetadata(
            title: resolvedTitle,
            pageCount: pdfDocument.pageCount,
            previewImageData: previewImageData
        )
    }
}
