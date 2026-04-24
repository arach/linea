import Foundation
import SwiftUI

/// Read/write per-page extracted text to disk, under a document's folder in
/// Application Support. Files live at
/// `Application Support/<bundle-id>/<doc-UUID>/pages/page-NNNN.txt`.
///
/// This type is `Sendable` so it can cross actor boundaries into the
/// background extraction pipeline.
struct PageTextStore: Sendable {
    private let storageRootURL: URL

    init() {
        let fileManager = FileManager.default
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? "com.uselinea.reader"
        self.storageRootURL = appSupport.appendingPathComponent(bundleIdentifier, isDirectory: true)
    }

    private var fileManager: FileManager { .default }

    // MARK: - Paths

    func pagesDirectory(for documentID: UUID) -> URL {
        storageRootURL
            .appendingPathComponent(documentID.uuidString, isDirectory: true)
            .appendingPathComponent("pages", isDirectory: true)
    }

    func pageURL(for documentID: UUID, pageNumber: Int) -> URL {
        let name = String(format: "page-%04d.txt", pageNumber)
        return pagesDirectory(for: documentID).appendingPathComponent(name)
    }

    // MARK: - Existence

    func isCached(documentID: UUID, pageNumber: Int) -> Bool {
        fileManager.fileExists(atPath: pageURL(for: documentID, pageNumber: pageNumber).path)
    }

    // MARK: - Read / Write

    func readPage(documentID: UUID, pageNumber: Int) -> String? {
        let url = pageURL(for: documentID, pageNumber: pageNumber)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    func writePage(_ text: String, documentID: UUID, pageNumber: Int) throws {
        let dir = pagesDirectory(for: documentID)
        try fileManager.createDirectory(
            at: dir,
            withIntermediateDirectories: true,
            attributes: nil
        )
        let url = pageURL(for: documentID, pageNumber: pageNumber)
        try text.write(to: url, atomically: true, encoding: .utf8)
    }

    // MARK: - Aggregated reads

    /// Concatenates pages in the given range (inclusive), separated by a blank
    /// line. Missing pages are treated as empty strings.
    func readPages(documentID: UUID, range: ClosedRange<Int>) -> String {
        var parts: [String] = []
        parts.reserveCapacity(range.count)
        for pageNumber in range {
            if let text = readPage(documentID: documentID, pageNumber: pageNumber), !text.isEmpty {
                parts.append(text)
            }
        }
        return parts.joined(separator: "\n\n")
    }

    /// Returns the number of `page-NNNN.txt` files present for the document.
    func cachedPageCount(for documentID: UUID) -> Int {
        let dir = pagesDirectory(for: documentID)
        guard let contents = try? fileManager.contentsOfDirectory(atPath: dir.path) else {
            return 0
        }
        return contents.filter { $0.hasPrefix("page-") && $0.hasSuffix(".txt") }.count
    }
}

// MARK: - Environment plumbing

private struct PageTextStoreKey: EnvironmentKey {
    static let defaultValue: PageTextStore = PageTextStore()
}

extension EnvironmentValues {
    var pageTextStore: PageTextStore {
        get { self[PageTextStoreKey.self] }
        set { self[PageTextStoreKey.self] = newValue }
    }
}
