import Foundation
import Security

/// Tiny Keychain-backed key/value store for provider API keys.
///
/// Ported from Talkie's `KeychainManager` but trimmed to the three calls
/// Linea actually needs: `get`, `set`, `remove`. All items live under one
/// service string so the keys are easy to audit in Keychain Access.
final class APIKeyStore: @unchecked Sendable {
    static let shared = APIKeyStore()

    private let service = "com.linea.apikeys"

    /// Retrieve the key for a given provider ID. Returns `nil` when missing or
    /// empty.
    func get(providerID: String) -> String? {
        var query = baseQuery(providerID: providerID)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8),
              !string.isEmpty else {
            return nil
        }

        return string
    }

    /// Store (or replace) the API key for a provider. Writing an empty string
    /// removes the entry.
    @discardableResult
    func set(providerID: String, value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return remove(providerID: providerID)
        }

        guard let data = trimmed.data(using: .utf8) else { return false }

        let baseQuery = baseQuery(providerID: providerID)
        let updateAttributes: [String: Any] = [kSecValueData as String: data]

        var status = SecItemUpdate(baseQuery as CFDictionary, updateAttributes as CFDictionary)

        if status == errSecItemNotFound {
            var addQuery = baseQuery
            addQuery[kSecValueData as String] = data
            status = SecItemAdd(addQuery as CFDictionary, nil)
        }

        return status == errSecSuccess
    }

    /// Remove the API key for a provider. Returns `true` on success or when
    /// the entry is already absent.
    @discardableResult
    func remove(providerID: String) -> Bool {
        let status = SecItemDelete(baseQuery(providerID: providerID) as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    /// Whether an (non-empty) API key is currently stored.
    func hasKey(providerID: String) -> Bool {
        get(providerID: providerID) != nil
    }

    // MARK: - Private

    private func baseQuery(providerID: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: providerID,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
    }
}
