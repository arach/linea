import Foundation
import LineaCore

struct ImportedDocumentDraft {
    var title: String
    var sourceKind: DocumentSourceKind
    var sourceURL: URL?
    var sections: [DocumentSection]
    var fullText: String
    var previewImageData: Data?
}

extension DocumentSection {
    /// Load the section's text. Legacy documents keep `text` populated
    /// inline; new PDF imports store text per-page on disk and reconstruct
    /// the section via `PageTextStore` when rendered.
    func sectionText(loadingWith store: PageTextStore, documentID: UUID) async -> String {
        if !text.isEmpty { return text }
        guard let range = pageRange else { return "" }
        return await Task.detached(priority: .userInitiated) {
            store.readPages(documentID: documentID, range: range)
        }.value
    }
}
