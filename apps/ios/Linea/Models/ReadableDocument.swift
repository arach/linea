import Foundation

enum DocumentSourceKind: String, Codable, CaseIterable, Identifiable {
    case pdf
    case url
    case scan
    case image
    case text

    var id: String { rawValue }

    var label: String {
        switch self {
        case .pdf: "PDF"
        case .url: "URL"
        case .scan: "Scan"
        case .image: "Image"
        case .text: "Text"
        }
    }
}

struct ImportedAsset: Identifiable, Codable, Hashable {
    enum Kind: String, Codable {
        case sourceFile
        case previewImage
        case scannedPage
    }

    var id: UUID = UUID()
    var kind: Kind
    var relativePath: String
}

struct DocumentSection: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var title: String
    var text: String
    var pageNumber: Int?

    var wordCount: Int {
        text.lineaWordCount
    }
}

struct DocumentConversationTurn: Identifiable, Codable, Hashable {
    enum Role: String, Codable {
        case user
        case assistant
        case system
    }

    var id: UUID = UUID()
    var role: Role
    var text: String
    var createdAt: Date = .now
}

struct DocumentConversationThread: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var title: String
    var createdAt: Date = .now
    var updatedAt: Date = .now
    var turns: [DocumentConversationTurn] = []
}

struct ReadableDocument: Identifiable, Codable, Hashable {
    var id: UUID = UUID()
    var title: String
    var sourceKind: DocumentSourceKind
    var sourceURL: String?
    var createdAt: Date = .now
    var updatedAt: Date = .now
    var lastOpenedAt: Date?
    var sections: [DocumentSection]
    var fullText: String
    var pageAssets: [ImportedAsset] = []
    var conversationThreads: [DocumentConversationThread] = []

    var subtitle: String {
        "\(sourceKind.label) · \(totalWordCount) words"
    }

    var totalWordCount: Int {
        fullText.lineaWordCount
    }

    var preview: String {
        String(fullText.prefix(220)).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct ImportedDocumentDraft {
    var title: String
    var sourceKind: DocumentSourceKind
    var sourceURL: URL?
    var sections: [DocumentSection]
    var fullText: String
    var previewImageData: Data?
}

enum DocumentSectionBuilder {
    static func buildSections(
        from rawText: String,
        pageNumber: Int? = nil,
        preferredTitle: String? = nil
    ) -> [DocumentSection] {
        let text = rawText.normalizedDocumentText
        guard !text.isEmpty else { return [] }

        let paragraphs = text
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !paragraphs.isEmpty else {
            return [
                DocumentSection(
                    title: preferredTitle ?? fallbackTitle(for: text, pageNumber: pageNumber, index: 0),
                    text: text,
                    pageNumber: pageNumber
                )
            ]
        }

        var sections: [DocumentSection] = []
        var buffer: [String] = []
        var sectionIndex = 0

        func flush() {
            let joined = buffer.joined(separator: "\n\n").normalizedDocumentText
            guard !joined.isEmpty else { return }
            sections.append(
                DocumentSection(
                    title: sectionIndex == 0
                        ? (preferredTitle ?? fallbackTitle(for: joined, pageNumber: pageNumber, index: sectionIndex))
                        : fallbackTitle(for: joined, pageNumber: pageNumber, index: sectionIndex),
                    text: joined,
                    pageNumber: pageNumber
                )
            )
            sectionIndex += 1
            buffer.removeAll(keepingCapacity: true)
        }

        for paragraph in paragraphs {
            let candidate = (buffer + [paragraph]).joined(separator: "\n\n")
            if candidate.count > 1_400 && !buffer.isEmpty {
                flush()
            }
            buffer.append(paragraph)
        }

        flush()

        return sections
    }

    private static func fallbackTitle(for text: String, pageNumber: Int?, index: Int) -> String {
        if let heading = headingCandidate(from: text) {
            return heading
        }

        if let pageNumber {
            return index == 0 ? "Page \(pageNumber)" : "Page \(pageNumber) · Part \(index + 1)"
        }

        return index == 0 ? "Opening" : "Section \(index + 1)"
    }

    private static func headingCandidate(from text: String) -> String? {
        guard let line = text
            .components(separatedBy: .newlines)
            .map({ $0.trimmingCharacters(in: .whitespacesAndNewlines) })
            .first(where: { !$0.isEmpty }) else {
            return nil
        }

        guard line.count <= 80, line.lineaWordCount <= 10 else {
            return nil
        }

        return line
    }
}

extension String {
    var normalizedDocumentText: String {
        let normalizedLineEndings = replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")

        let trimmedLines = normalizedLineEndings
            .components(separatedBy: .newlines)
            .map { line in
                line.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }

        let joined = trimmedLines.joined(separator: "\n")
        let collapsed = joined.replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
        return collapsed.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var lineaWordCount: Int {
        split(whereSeparator: \.isWhitespace).count
    }
}
