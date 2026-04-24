import Foundation
import PDFKit
import UIKit

/// Per-document extraction progress surfaced to the UI.
struct PDFExtractionProgress: Equatable, Sendable {
    enum Status: String, Sendable {
        case idle
        case running
        case complete
        case cancelled
        case failed
    }

    var pageCount: Int = 0
    var extractedCount: Int = 0
    var status: Status = .idle

    var fraction: Double {
        guard pageCount > 0 else { return 0 }
        return Double(extractedCount) / Double(pageCount)
    }

    var isComplete: Bool { status == .complete }
}

/// Background pipeline that reads each PDF page's text and writes it to
/// `PageTextStore` one page at a time. Runs off the main actor for file IO
/// + PDFKit page parsing, then hops back to publish progress.
///
/// Shared service — lives on `LineaApp` so it survives the user leaving the
/// reader. Cancellation is per-document via `cancel(documentID:)`.
@MainActor
final class PDFExtractionService: ObservableObject {
    @Published private(set) var progress: [UUID: PDFExtractionProgress] = [:]

    private let pageStore: PageTextStore
    private let library: DocumentLibrary
    private var tasks: [UUID: Task<Void, Never>] = [:]

    init(library: DocumentLibrary, pageStore: PageTextStore) {
        self.library = library
        self.pageStore = pageStore
    }

    // MARK: - Public API

    func progress(for documentID: UUID) -> PDFExtractionProgress {
        progress[documentID] ?? PDFExtractionProgress()
    }

    func extractionComplete(for documentID: UUID) -> Bool {
        if let entry = progress[documentID] {
            return entry.status == .complete
        }
        return library.document(id: documentID)?.extractionComplete ?? false
    }

    /// Kick off a background extraction for `documentID`, reading pages from
    /// the PDF at `pdfURL`. Idempotent: if a task is already running for this
    /// ID we leave it alone.
    func startExtraction(documentID: UUID, pdfURL: URL, pageCount: Int) {
        if tasks[documentID] != nil { return }

        var initial = progress[documentID] ?? PDFExtractionProgress()
        initial.pageCount = pageCount
        initial.status = .running
        initial.extractedCount = pageStore.cachedPageCount(for: documentID)
        progress[documentID] = initial

        let pageStore = self.pageStore
        let task = Task { [weak self] in
            guard let self else { return }
            await self.runExtraction(
                documentID: documentID,
                pdfURL: pdfURL,
                pageCount: pageCount,
                pageStore: pageStore
            )
        }
        tasks[documentID] = task
    }

    func cancel(documentID: UUID) {
        tasks[documentID]?.cancel()
        tasks[documentID] = nil
        if var entry = progress[documentID] {
            entry.status = .cancelled
            progress[documentID] = entry
        }
    }

    /// Opt-in OCR retry for a single page. The extraction pipeline itself no
    /// longer runs OCR on empty pages; the reader can call this later.
    func retryWithOCR(documentID: UUID, pageNumber: Int, pdfURL: URL) async {
        let store = self.pageStore
        await Task.detached(priority: .userInitiated) {
            guard let pdf = PDFDocument(url: pdfURL),
                  let page = pdf.page(at: pageNumber - 1) else {
                return
            }
            let image = page.thumbnail(of: CGSize(width: 1200, height: 1600), for: .cropBox)
            if let ocr = try? await OCRService.extractText(from: image), !ocr.text.isEmpty {
                try? store.writePage(ocr.text, documentID: documentID, pageNumber: pageNumber)
            }
        }.value
    }

    // MARK: - Worker

    private func runExtraction(
        documentID: UUID,
        pdfURL: URL,
        pageCount: Int,
        pageStore: PageTextStore
    ) async {
        // Stream per-page extraction off the main actor.
        let stream = AsyncStream<Int> { continuation in
            let extractionTask = Task.detached(priority: .utility) {
                guard let pdf = PDFDocument(url: pdfURL) else {
                    continuation.finish()
                    return
                }
                for pageIndex in 0..<pdf.pageCount {
                    if Task.isCancelled {
                        continuation.finish()
                        return
                    }
                    let pageNumber = pageIndex + 1
                    if pageStore.isCached(documentID: documentID, pageNumber: pageNumber) {
                        continuation.yield(pageNumber)
                        continue
                    }
                    guard let page = pdf.page(at: pageIndex) else {
                        // Record an empty marker to show the page was visited.
                        try? pageStore.writePage("", documentID: documentID, pageNumber: pageNumber)
                        continuation.yield(pageNumber)
                        continue
                    }
                    let raw = (page.string ?? "").normalizedDocumentText
                    try? pageStore.writePage(raw, documentID: documentID, pageNumber: pageNumber)
                    continuation.yield(pageNumber)
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                extractionTask.cancel()
            }
        }

        for await pageNumber in stream {
            if Task.isCancelled { break }
            var entry = progress[documentID] ?? PDFExtractionProgress()
            entry.pageCount = pageCount
            entry.extractedCount = max(entry.extractedCount, pageNumber)
            entry.status = .running
            progress[documentID] = entry
        }

        tasks[documentID] = nil

        if Task.isCancelled {
            if var entry = progress[documentID] {
                entry.status = .cancelled
                progress[documentID] = entry
            }
            return
        }

        // All pages extracted — compute sections and mark the document complete.
        await finalize(documentID: documentID, pdfURL: pdfURL, pageCount: pageCount)
    }

    private func finalize(documentID: UUID, pdfURL: URL, pageCount: Int) async {
        let pageStore = self.pageStore
        let sections: [DocumentSection] = await Task.detached(priority: .utility) {
            var payloads: [DocumentChunker.PagePayload] = []
            payloads.reserveCapacity(pageCount)
            for pageNumber in 1...max(pageCount, 1) {
                let text = pageStore.readPage(documentID: documentID, pageNumber: pageNumber) ?? ""
                payloads.append(DocumentChunker.PagePayload(pageNumber: pageNumber, text: text))
            }
            let pdf = PDFDocument(url: pdfURL)
            return DocumentChunker.buildSections(pdf: pdf, pages: payloads)
        }.value

        library.updateExtractionState(
            documentID: documentID,
            pageCount: pageCount,
            sections: sections,
            complete: true
        )

        var entry = progress[documentID] ?? PDFExtractionProgress()
        entry.pageCount = pageCount
        entry.extractedCount = pageCount
        entry.status = .complete
        progress[documentID] = entry
    }
}
