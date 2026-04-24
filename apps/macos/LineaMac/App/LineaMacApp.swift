import SwiftUI

@main
struct LineaMacApp: App {
    @State private var store = HelperMacStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
                .frame(minWidth: 980, minHeight: 640)
        }
        .windowResizability(.contentSize)

        Settings {
            HelperSettingsView()
                .environment(store)
                .frame(width: 520, height: 420)
        }
    }
}
