import SwiftUI

@main
struct ParklySwiftUIApp: App {
    @StateObject private var store = ParklyStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
        }
    }
}
