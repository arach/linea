import Foundation
import LineaCore

struct URLContent {
    let title: String?
    let text: String
    let sourceURL: URL
}

enum URLImportService {
    static func extract(from url: URL) async throws -> URLContent {
        var request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 20)
        request.setValue(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
            forHTTPHeaderField: "User-Agent"
        )
        request.setValue("text/html", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw URLImportError.httpError
        }

        let html = String(data: data, encoding: .utf8)
            ?? String(data: data, encoding: .unicode)
            ?? String(data: data, encoding: .ascii)

        guard let html else {
            throw URLImportError.decodingFailed
        }

        let text = extractReadableText(from: html)
        guard !text.isEmpty else {
            throw URLImportError.noContent
        }

        return URLContent(
            title: extractTitle(from: html),
            text: text,
            sourceURL: url
        )
    }

    private static func extractTitle(from html: String) -> String? {
        if let ogTitle = extractMetaContent(from: html, property: "og:title") {
            let trimmed = decodeHTMLEntities(ogTitle).trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }

        guard let titleRange = html.range(of: "<title[^>]*>", options: .regularExpression),
              let endRange = html.range(of: "</title>", options: .caseInsensitive, range: titleRange.upperBound..<html.endIndex) else {
            return nil
        }

        let title = String(html[titleRange.upperBound..<endRange.lowerBound])
        let decoded = decodeHTMLEntities(title).trimmingCharacters(in: .whitespacesAndNewlines)
        return decoded.isEmpty ? nil : decoded
    }

    private static func extractMetaContent(from html: String, property: String) -> String? {
        let patterns = [
            "<meta[^>]+(?:property|name)=\"\(NSRegularExpression.escapedPattern(for: property))\"[^>]+content=\"([^\"]*)\"",
            "<meta[^>]+content=\"([^\"]*)\"[^>]+(?:property|name)=\"\(NSRegularExpression.escapedPattern(for: property))\""
        ]

        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
                  let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
                  let contentRange = Range(match.range(at: 1), in: html) else {
                continue
            }

            return String(html[contentRange])
        }

        return nil
    }

    private static func extractReadableText(from html: String) -> String {
        var text = html

        let stripPatterns = [
            "<script[^>]*>[\\s\\S]*?</script>",
            "<style[^>]*>[\\s\\S]*?</style>",
            "<nav[^>]*>[\\s\\S]*?</nav>",
            "<header[^>]*>[\\s\\S]*?</header>",
            "<footer[^>]*>[\\s\\S]*?</footer>",
            "<aside[^>]*>[\\s\\S]*?</aside>",
            "<noscript[^>]*>[\\s\\S]*?</noscript>",
            "<!--[\\s\\S]*?-->"
        ]

        for pattern in stripPatterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { continue }
            text = regex.stringByReplacingMatches(
                in: text,
                range: NSRange(text.startIndex..., in: text),
                withTemplate: " "
            )
        }

        for tag in ["p", "div", "br", "li", "h1", "h2", "h3", "h4", "blockquote", "article", "section"] {
            guard let regex = try? NSRegularExpression(pattern: "</?\\s*\(tag)[^>]*>", options: .caseInsensitive) else { continue }
            text = regex.stringByReplacingMatches(
                in: text,
                range: NSRange(text.startIndex..., in: text),
                withTemplate: "\n"
            )
        }

        if let regex = try? NSRegularExpression(pattern: "<[^>]+>") {
            text = regex.stringByReplacingMatches(
                in: text,
                range: NSRange(text.startIndex..., in: text),
                withTemplate: " "
            )
        }

        return decodeHTMLEntities(text)
            .normalizedDocumentText
    }

    private static func decodeHTMLEntities(_ text: String) -> String {
        var result = text

        let replacements = [
            ("&amp;", "&"),
            ("&lt;", "<"),
            ("&gt;", ">"),
            ("&quot;", "\""),
            ("&#39;", "'"),
            ("&apos;", "'"),
            ("&nbsp;", " "),
            ("&ndash;", "-"),
            ("&mdash;", "--"),
            ("&hellip;", "...")
        ]

        for (entity, replacement) in replacements {
            result = result.replacingOccurrences(of: entity, with: replacement)
        }

        return result
    }
}

enum URLImportError: LocalizedError {
    case httpError
    case decodingFailed
    case noContent

    var errorDescription: String? {
        switch self {
        case .httpError:
            return "The page could not be loaded."
        case .decodingFailed:
            return "The page content could not be decoded."
        case .noContent:
            return "No readable content was found on that page."
        }
    }
}
