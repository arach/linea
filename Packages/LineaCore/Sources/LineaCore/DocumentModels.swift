import Foundation

public enum DocumentSourceKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case pdf
    case url
    case scan
    case image
    case text

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .pdf: "PDF"
        case .url: "URL"
        case .scan: "Scan"
        case .image: "Image"
        case .text: "Text"
        }
    }
}

public struct ImportedAsset: Identifiable, Codable, Hashable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case sourceFile
        case previewImage
        case scannedPage
    }

    public var id: UUID
    public var kind: Kind
    public var relativePath: String

    public init(
        id: UUID = UUID(),
        kind: Kind,
        relativePath: String
    ) {
        self.id = id
        self.kind = kind
        self.relativePath = relativePath
    }
}

public struct DocumentSection: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var title: String
    public var text: String
    public var pageNumber: Int?
    public var pageRange: ClosedRange<Int>?

    public init(
        id: UUID = UUID(),
        title: String,
        text: String,
        pageNumber: Int? = nil,
        pageRange: ClosedRange<Int>? = nil
    ) {
        self.id = id
        self.title = title
        self.text = text
        self.pageNumber = pageNumber
        self.pageRange = pageRange
    }

    public var wordCount: Int {
        text.lineaWordCount
    }
}

public struct DocumentConversationTurn: Identifiable, Codable, Hashable, Sendable {
    public enum Role: String, Codable, Sendable {
        case user
        case assistant
        case system
    }

    public var id: UUID
    public var role: Role
    public var text: String
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        role: Role,
        text: String,
        createdAt: Date = .now
    ) {
        self.id = id
        self.role = role
        self.text = text
        self.createdAt = createdAt
    }
}

public struct DocumentConversationThread: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var title: String
    public var createdAt: Date
    public var updatedAt: Date
    public var turns: [DocumentConversationTurn]

    public init(
        id: UUID = UUID(),
        title: String,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        turns: [DocumentConversationTurn] = []
    ) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.turns = turns
    }
}

public struct ReadableDocument: Identifiable, Codable, Hashable, Sendable {
    public var id: UUID
    public var title: String
    public var sourceKind: DocumentSourceKind
    public var sourceURL: String?
    public var createdAt: Date
    public var updatedAt: Date
    public var lastOpenedAt: Date?
    public var sections: [DocumentSection]
    public var fullText: String
    public var pageCount: Int
    public var extractionComplete: Bool
    public var pageAssets: [ImportedAsset]
    public var conversationThreads: [DocumentConversationThread]

    public init(
        id: UUID = UUID(),
        title: String,
        sourceKind: DocumentSourceKind,
        sourceURL: String? = nil,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        lastOpenedAt: Date? = nil,
        sections: [DocumentSection],
        fullText: String,
        pageCount: Int = 0,
        extractionComplete: Bool = false,
        pageAssets: [ImportedAsset] = [],
        conversationThreads: [DocumentConversationThread] = []
    ) {
        self.id = id
        self.title = title
        self.sourceKind = sourceKind
        self.sourceURL = sourceURL
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastOpenedAt = lastOpenedAt
        self.sections = sections
        self.fullText = fullText
        self.pageCount = pageCount
        self.extractionComplete = extractionComplete
        self.pageAssets = pageAssets
        self.conversationThreads = conversationThreads
    }

    public var subtitle: String {
        "\(sourceKind.label) · \(totalWordCount) words"
    }

    public var totalWordCount: Int {
        if !fullText.isEmpty {
            return fullText.lineaWordCount
        }
        return sections.reduce(0) { $0 + $1.wordCount }
    }

    public var preview: String {
        if !fullText.isEmpty {
            return String(fullText.prefix(220)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let firstNonEmpty = sections.first(where: { !$0.text.isEmpty }) {
            return String(firstNonEmpty.text.prefix(220)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return ""
    }
}

public enum DocumentSectionBuilder {
    public static func buildSections(
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

public extension String {
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
