import Foundation
import LineaCore
import PDFKit

/// Strategies for building `[DocumentSection]` from a (potentially very large)
/// PDF whose pages have already been extracted to disk via `PageTextStore`.
///
/// The three strategies, in preference order:
///   1. `outline` — walk the PDF's root outline, one section per entry.
///   2. `evenChunks` — for docs with >30k words and no usable outline, split
///      into ~10 roughly-even chunks by cumulative word count, respecting
///      page boundaries.
///   3. `paragraphPacking` — legacy fallback, feeds pages one at a time into
///      `DocumentSectionBuilder` (~1400-char flushes). No giant concat.
enum DocumentChunker {
    static let largeDocumentWordThreshold = 30_000
    static let targetChunkCount = 10

    struct PagePayload {
        let pageNumber: Int
        let text: String
    }

    // MARK: - Strategy 1: PDFOutline

    static func sectionsFromOutline(_ pdf: PDFDocument) -> [DocumentSection]? {
        guard let root = pdf.outlineRoot, root.numberOfChildren > 0 else {
            return nil
        }

        var entries: [(title: String, page: Int)] = []
        collectOutlineEntries(from: root, into: &entries, pdf: pdf)

        guard !entries.isEmpty else { return nil }

        // Deduplicate: if two entries point at the same page, keep the first.
        var seenPages = Set<Int>()
        entries = entries.filter { entry in
            if seenPages.contains(entry.page) { return false }
            seenPages.insert(entry.page)
            return true
        }

        guard !entries.isEmpty else { return nil }

        let totalPages = pdf.pageCount
        var sections: [DocumentSection] = []
        for (index, entry) in entries.enumerated() {
            let startPage = entry.page
            let endPage: Int
            if index + 1 < entries.count {
                endPage = max(startPage, entries[index + 1].page - 1)
            } else {
                endPage = totalPages
            }
            let range = startPage...endPage
            sections.append(
                DocumentSection(
                    title: entry.title,
                    text: "",
                    pageNumber: startPage,
                    pageRange: range
                )
            )
        }
        return sections
    }

    private static func collectOutlineEntries(
        from node: PDFOutline,
        into entries: inout [(title: String, page: Int)],
        pdf: PDFDocument
    ) {
        for i in 0..<node.numberOfChildren {
            guard let child = node.child(at: i) else { continue }
            let rawTitle = child.label?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !rawTitle.isEmpty, let destPage = child.destination?.page {
                let pageIndex = pdf.index(for: destPage) + 1
                entries.append((title: rawTitle, page: pageIndex))
            }
            if child.numberOfChildren > 0 {
                collectOutlineEntries(from: child, into: &entries, pdf: pdf)
            }
        }
    }

    // MARK: - Strategy 2: Even chunks

    /// Given page word counts (ordered by page number starting at 1), return
    /// ~`targetChunkCount` ranges that partition the document without
    /// splitting pages mid-way.
    static func sectionsFromEvenChunks(
        pageWordCounts: [Int]
    ) -> [DocumentSection] {
        let total = pageWordCounts.reduce(0, +)
        guard total > 0, !pageWordCounts.isEmpty else { return [] }

        let targetPerChunk = max(1, total / targetChunkCount)
        var sections: [DocumentSection] = []
        var chunkStart = 1
        var accumulated = 0
        var chunkIndex = 0

        for (idx, words) in pageWordCounts.enumerated() {
            let pageNumber = idx + 1
            accumulated += words

            let isLastPage = pageNumber == pageWordCounts.count
            let shouldFlush = accumulated >= targetPerChunk && chunkIndex + 1 < targetChunkCount

            if shouldFlush || isLastPage {
                let range = chunkStart...pageNumber
                sections.append(
                    DocumentSection(
                        title: titleForEvenChunk(index: chunkIndex, range: range),
                        text: "",
                        pageNumber: chunkStart,
                        pageRange: range
                    )
                )
                chunkIndex += 1
                chunkStart = pageNumber + 1
                accumulated = 0
            }
        }

        return sections
    }

    private static func titleForEvenChunk(index: Int, range: ClosedRange<Int>) -> String {
        if range.lowerBound == range.upperBound {
            return "Part \(index + 1) · Page \(range.lowerBound)"
        }
        return "Part \(index + 1) · Pages \(range.lowerBound)–\(range.upperBound)"
    }

    // MARK: - Strategy 3: Paragraph packing (page by page)

    /// Feed pages one at a time into `DocumentSectionBuilder`, preserving the
    /// legacy ~1400-char flush behaviour without ever joining all pages into a
    /// single megatext.
    static func sectionsFromParagraphPacking(pages: [PagePayload]) -> [DocumentSection] {
        var sections: [DocumentSection] = []
        for (index, payload) in pages.enumerated() {
            guard !payload.text.isEmpty else { continue }
            let built = DocumentSectionBuilder.buildSections(
                from: payload.text,
                pageNumber: payload.pageNumber,
                preferredTitle: sections.isEmpty && index == 0 ? "Opening" : nil
            )
            for var section in built {
                section.pageRange = payload.pageNumber...payload.pageNumber
                sections.append(section)
            }
        }
        return sections
    }

    // MARK: - Top-level entry point

    /// Pick the best strategy given the extracted page payloads and (optional)
    /// PDF outline. Strategy 1 wins if the outline is usable; otherwise if
    /// the doc is large we pick strategy 2; else strategy 3.
    static func buildSections(
        pdf: PDFDocument?,
        pages: [PagePayload]
    ) -> [DocumentSection] {
        if let pdf, let outlineSections = sectionsFromOutline(pdf) {
            return outlineSections
        }

        let pageWordCounts = pages.map { $0.text.lineaWordCount }
        let totalWords = pageWordCounts.reduce(0, +)

        if totalWords > largeDocumentWordThreshold {
            return sectionsFromEvenChunks(pageWordCounts: pageWordCounts)
        }

        return sectionsFromParagraphPacking(pages: pages)
    }
}
