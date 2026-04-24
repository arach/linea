import SwiftUI
import UIKit
import VisionKit

struct DocumentScannerView: UIViewControllerRepresentable {
    let onComplete: ([UIImage]) -> Void
    let onFailure: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator {
        Coordinator(
            onComplete: onComplete,
            onFailure: onFailure,
            dismiss: dismiss.callAsFunction
        )
    }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: VNDocumentCameraViewController, context: Context) {}

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onComplete: ([UIImage]) -> Void
        let onFailure: (String) -> Void
        let dismiss: () -> Void

        init(
            onComplete: @escaping ([UIImage]) -> Void,
            onFailure: @escaping (String) -> Void,
            dismiss: @escaping () -> Void
        ) {
            self.onComplete = onComplete
            self.onFailure = onFailure
            self.dismiss = dismiss
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            dismiss()
        }

        func documentCameraViewController(
            _ controller: VNDocumentCameraViewController,
            didFailWithError error: Error
        ) {
            onFailure(error.localizedDescription)
            dismiss()
        }

        func documentCameraViewController(
            _ controller: VNDocumentCameraViewController,
            didFinishWith scan: VNDocumentCameraScan
        ) {
            guard scan.pageCount > 0 else {
                onFailure("No pages were captured.")
                dismiss()
                return
            }

            let images = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            onComplete(images)
            dismiss()
        }
    }
}
