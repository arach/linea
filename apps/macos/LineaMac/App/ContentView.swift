import SwiftUI

enum SidebarItem: String, CaseIterable, Identifiable {
    case library
    case helper
    case jobs

    var id: String { rawValue }

    var title: String {
        switch self {
        case .library: "Library"
        case .helper: "Helper Mac"
        case .jobs: "Jobs"
        }
    }

    var symbolName: String {
        switch self {
        case .library: "books.vertical"
        case .helper: "desktopcomputer"
        case .jobs: "waveform.path.ecg.rectangle"
        }
    }
}

@Observable
final class HelperMacStore {
    var helperEnabled = false
    var status: String = "Offline"
    var selectedSidebarItem: SidebarItem? = .helper
    var recentJobs: [HelperJobSummary] = [
        HelperJobSummary(
            title: "Generate audiobook",
            detail: "A Philosophy of Walking",
            state: "Planned"
        ),
        HelperJobSummary(
            title: "OCR import",
            detail: "Scanned pages",
            state: "Planned"
        )
    ]
}

struct HelperJobSummary: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let state: String
}

struct ContentView: View {
    @Environment(HelperMacStore.self) private var store

    var body: some View {
        NavigationSplitView {
            List(SidebarItem.allCases, selection: Binding(
                get: { store.selectedSidebarItem },
                set: { store.selectedSidebarItem = $0 }
            )) { item in
                Label(item.title, systemImage: item.symbolName)
            }
            .navigationTitle("Linea")
        } detail: {
            Group {
                switch store.selectedSidebarItem ?? .helper {
                case .library:
                    LibraryPlaceholderView()
                case .helper:
                    HelperDashboardView()
                case .jobs:
                    HelperJobsView()
                }
            }
            .padding(28)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color(nsColor: .windowBackgroundColor))
        }
    }
}

private struct LibraryPlaceholderView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Library")
                .font(.system(size: 32, weight: .semibold, design: .serif))

            Text("The native Mac library shell will land here once we lift the document core out of the iOS app.")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)

            Spacer()
        }
    }
}

private struct HelperDashboardView: View {
    @Environment(HelperMacStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Helper Mac")
                .font(.system(size: 34, weight: .semibold, design: .serif))

            Text("This Mac will become the local execution runtime for audiobook generation, OCR, and later timing/alignment workloads.")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Toggle(isOn: Binding(
                get: { store.helperEnabled },
                set: {
                    store.helperEnabled = $0
                    store.status = $0 ? "Ready on local network" : "Offline"
                }
            )) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Use this Mac as a Helper")
                        .font(.headline)
                    Text("Allow Linea on your other devices to request audiobook and OCR jobs.")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
            }
            .toggleStyle(.switch)

            HStack(spacing: 16) {
                helperMetric(title: "Status", value: store.status)
                helperMetric(title: "Capabilities", value: "Audio, OCR")
                helperMetric(title: "Transport", value: "Local first")
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Near-term priorities")
                    .font(.headline)

                helperBullet("Bring the shared document core over from iOS.")
                helperBullet("Add Bonjour discovery and a direct local control path.")
                helperBullet("Make audiobook generation the first real helper workload.")
            }

            Spacer()
        }
    }

    private func helperMetric(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 18, weight: .semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func helperBullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(Color.primary.opacity(0.8))
                .frame(width: 6, height: 6)
                .padding(.top, 7)
            Text(text)
                .font(.system(size: 14))
        }
    }
}

private struct HelperJobsView: View {
    @Environment(HelperMacStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Jobs")
                .font(.system(size: 32, weight: .semibold, design: .serif))

            Text("This queue will show audiobook generation, OCR, and later timing/alignment work running on the Mac.")
                .font(.system(size: 15))
                .foregroundStyle(.secondary)

            if store.recentJobs.isEmpty {
                Text("No jobs yet.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.recentJobs) { job in
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(job.title)
                                .font(.headline)
                            Text(job.detail)
                                .font(.system(size: 13))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(job.state)
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 10)
                    Divider()
                }
            }

            Spacer()
        }
    }
}

struct HelperSettingsView: View {
    @Environment(HelperMacStore.self) private var store

    var body: some View {
        Form {
            Toggle("Use this Mac as a Helper", isOn: Binding(
                get: { store.helperEnabled },
                set: {
                    store.helperEnabled = $0
                    store.status = $0 ? "Ready on local network" : "Offline"
                }
            ))

            LabeledContent("Current status", value: store.status)
            LabeledContent("Planned first workload", value: "Audiobook generation")
            LabeledContent("Cloud fallback", value: "Later")
        }
        .formStyle(.grouped)
        .padding(18)
    }
}
