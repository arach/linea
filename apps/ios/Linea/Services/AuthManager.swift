import ClerkKit
import Foundation

struct AuthStep: Identifiable {
    let id = UUID()
    let name: String
    var status: Status
    var detail: String?

    enum Status {
        case pending
        case inProgress
        case completed
        case failed
    }
}

enum AuthError: LocalizedError {
    case notConfigured
    case cancelled
    case authFailed(String)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Clerk is not configured for this build yet."
        case .cancelled:
            return "Sign in was cancelled."
        case .authFailed(let message):
            return message
        }
    }
}

@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published private(set) var isConfigured = false
    @Published private(set) var isLoading = false
    @Published private(set) var authSteps: [AuthStep] = []
    @Published var lastErrorMessage: String?

    var isSignedIn: Bool {
        isConfigured && Clerk.shared.user != nil
    }

    var userEmail: String? {
        Clerk.shared.user?.primaryEmailAddress?.emailAddress
    }

    private init() {}

    func configureIfNeeded() {
        guard !isConfigured else { return }

        let publishableKey = LineaAppConfiguration.shared.clerkPublishableKey
        guard !publishableKey.isEmpty else { return }

        Clerk.configure(publishableKey: publishableKey)
        isConfigured = true
    }

    func signIn() async throws {
        guard isConfigured else {
            throw AuthError.notConfigured
        }

        isLoading = true
        lastErrorMessage = nil
        authSteps = [
            AuthStep(name: "Authenticating", status: .inProgress),
            AuthStep(name: "Restoring session", status: .pending)
        ]

        defer {
            isLoading = false
            if lastErrorMessage == nil, isSignedIn {
                authSteps = []
            }
        }

        do {
            _ = try await Clerk.shared.auth.signInWithApple()
            updateStep(0, status: .completed)
            updateStep(1, status: .completed)
        } catch is CancellationError {
            updateStep(0, status: .failed, detail: "Cancelled")
            throw AuthError.cancelled
        } catch {
            updateStep(0, status: .failed, detail: "Failed")
            lastErrorMessage = error.localizedDescription
            throw AuthError.authFailed(error.localizedDescription)
        }
    }

    func signOut() {
        guard isConfigured else { return }

        Task { @MainActor in
            do {
                try await Clerk.shared.auth.signOut()
                lastErrorMessage = nil
            } catch {
                lastErrorMessage = error.localizedDescription
            }
        }
    }

    var authToken: String? {
        get async {
            guard isConfigured else { return nil }
            return try? await Clerk.shared.auth.getToken()
        }
    }

    private func updateStep(_ index: Int, status: AuthStep.Status, detail: String? = nil) {
        guard authSteps.indices.contains(index) else { return }
        authSteps[index].status = status
        if let detail {
            authSteps[index].detail = detail
        }
    }
}
