import Foundation
import UIKit
import Vision

enum OCRService {
    struct OCRResult {
        let text: String
        let previewImageData: Data?
        let pageCount: Int
    }

    enum OCRError: LocalizedError {
        case noTextFound
        case invalidImage

        var errorDescription: String? {
            switch self {
            case .noTextFound:
                return "No text was found in that image."
            case .invalidImage:
                return "The selected image could not be processed."
            }
        }
    }

    static func extractText(from image: UIImage) async throws -> OCRResult {
        try await extractText(from: [image])
    }

    static func extractText(from images: [UIImage]) async throws -> OCRResult {
        guard !images.isEmpty else {
            throw OCRError.invalidImage
        }

        var chunks: [String] = []

        for image in images {
            let text = try await recognizedText(from: image)
            if !text.isEmpty {
                chunks.append(text)
            }
        }

        let combined = chunks
            .joined(separator: "\n\n")
            .normalizedDocumentText

        guard !combined.isEmpty else {
            throw OCRError.noTextFound
        }

        return OCRResult(
            text: combined,
            previewImageData: images.first?.jpegData(compressionQuality: 0.82),
            pageCount: images.count
        )
    }

    private static func recognizedText(from image: UIImage) async throws -> String {
        if #available(iOS 26.0, *), let cgImage = image.cgImage {
            var request = RecognizeDocumentsRequest()
            request.textRecognitionOptions.automaticallyDetectLanguage = true
            request.textRecognitionOptions.useLanguageCorrection = true
            request.textRecognitionOptions.maximumCandidateCount = 1

            let observations = try await ImageRequestHandler(cgImage).perform(request)
            let documentText = observations
                .map { observation -> String in
                    let title = observation.document.title?.transcript.normalizedDocumentText ?? ""
                    let paragraphs = observation.document.paragraphs
                        .map(\.transcript)
                        .map(\.normalizedDocumentText)
                        .filter { !$0.isEmpty }
                        .joined(separator: "\n\n")

                    return [title, paragraphs]
                        .filter { !$0.isEmpty }
                        .joined(separator: "\n\n")
                        .normalizedDocumentText
                }
                .filter { !$0.isEmpty }
                .joined(separator: "\n\n")
                .normalizedDocumentText

            if !documentText.isEmpty {
                return documentText
            }
        }

        return try await recognizeLegacyText(from: image)
    }

    private static func recognizeLegacyText(from image: UIImage) async throws -> String {
        guard let cgImage = image.cgImage else {
            throw OCRError.invalidImage
        }

        return try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let observations = request.results as? [VNRecognizedTextObservation] ?? []
                let text = observations
                    .compactMap { $0.topCandidates(1).first?.string }
                    .joined(separator: "\n")
                    .normalizedDocumentText

                if text.isEmpty {
                    continuation.resume(throwing: OCRError.noTextFound)
                } else {
                    continuation.resume(returning: text)
                }
            }

            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true

            Task.detached(priority: .userInitiated) {
                do {
                    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
                    try handler.perform([request])
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }
}
