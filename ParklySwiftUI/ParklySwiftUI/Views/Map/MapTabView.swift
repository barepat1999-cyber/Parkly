import SwiftUI
import MapKit

struct MapTabView: View {
    @EnvironmentObject var store: ParklyStore
    @State private var region = MKCoordinateRegion(
        center: SpotGenerator.copenhagenCenter,
        span: MKCoordinateSpan(latitudeDelta: 0.002, longitudeDelta: 0.002)
    )
    @State private var hasReportedRegion = false

    var body: some View {
        ZStack(alignment: .bottom) {
            UnclusteredMapView(
                region: $region,
                spots: store.spots,
                selectedSpotId: store.selectedSpotId,
                onSpotTap: { store.selectSpot($0) }
            )
            .onChange(of: region.center.latitude) { _ in store.updateMapCenter(region.center) }
            .onChange(of: region.center.longitude) { _ in store.updateMapCenter(region.center) }
            .onAppear {
                store.ensureDemoGarageLoaded()
                if !hasReportedRegion {
                    store.updateMapCenter(region.center)
                    hasReportedRegion = true
                }
            }

            VStack(alignment: .leading, spacing: 0) {
                Text("Spots: \(store.spots.count)")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                    .padding(10)
                    .background(Color.white)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.4), lineWidth: 1)
                    )
                    .padding(.leading, 16)
                    .padding(.top, 8)
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            VStack(spacing: 0) {
                Spacer()
                if store.showSelectSpotToast {
                    Text("Vælg en plads på kortet først")
                        .font(.subheadline)
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.black.opacity(0.7))
                        .cornerRadius(8)
                        .padding(.bottom, 8)
                        .transition(.opacity)
                        .onAppear {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                store.showSelectSpotToast = false
                            }
                        }
                }
                HStack(spacing: 12) {
                    Button(action: { store.reportAvailable() }) {
                        Text("Ledig plads")
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .background(Color(red: 0.3, green: 0.69, blue: 0.31))
                            .cornerRadius(10)
                    }
                    Button(action: { store.reportOccupied() }) {
                        Text("Optaget")
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 18)
                            .background(Color(red: 0.96, green: 0.26, blue: 0.21))
                            .cornerRadius(10)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
                .padding(.top, 16)
                .background(Color.white.opacity(0.95))
            }
        }
        .sheet(item: Binding(
            get: { store.selectedSpot.map { SpotSheetItem(spot: $0) } },
            set: { _ in store.selectSpot(nil) }
        )) { item in
            SpotDetailSheet(spot: item.spot)
        }
    }

}

struct SpotMarkerView: View {
    let status: ParkingSpot.SpotStatus
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Circle()
                .fill(SpotAnnotation.color(for: status))
                .frame(width: isSelected ? 24 : 20, height: isSelected ? 24 : 20)
                .overlay(
                    Circle()
                        .stroke(isSelected ? Color.blue : Color.white, lineWidth: isSelected ? 3 : 2)
                )
        }
        .buttonStyle(.plain)
    }
}

struct SpotSheetItem: Identifiable {
    let spot: ParkingSpot
    var id: String { spot.id }
}

struct SpotDetailSheet: View {
    let spot: ParkingSpot
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Plads \(spot.id)")
                    .font(.headline)
                Spacer()
                Button("Luk") { dismiss() }
            }
            Text("Status: \(spot.status == .available ? "Ledig" : "Optaget")")
                .font(.subheadline)
            Text("Opdateret: \(Date.formatDateLabel(spot.updatedAt)) \(spot.updatedAt.parklyTimeString)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(24)
        .presentationDetents([.height(140)])
    }
}
