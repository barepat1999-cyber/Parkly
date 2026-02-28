import SwiftUI

struct ContentView: View {
    @EnvironmentObject var store: ParklyStore

    var body: some View {
        TabView {
            MapTabView()
                .tabItem {
                    Label("Map", systemImage: "map")
                }
            HistoryTabView()
                .tabItem {
                    Label("History", systemImage: "clock.arrow.circlepath")
                }
            ProfileTabView()
                .tabItem {
                    Label("Profile", systemImage: "person")
                }
        }
    }
}
