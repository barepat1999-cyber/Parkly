import SwiftUI
import MapKit

struct SpotAnnotation: Identifiable {
    let id: String
    let coordinate: CLLocationCoordinate2D
    let status: ParkingSpot.SpotStatus
    let isSelected: Bool

    static func color(for status: ParkingSpot.SpotStatus) -> Color {
        switch status {
        case .available: return Color(red: 0.3, green: 0.69, blue: 0.31)
        case .occupied: return Color(red: 0.96, green: 0.26, blue: 0.21)
        }
    }
}
