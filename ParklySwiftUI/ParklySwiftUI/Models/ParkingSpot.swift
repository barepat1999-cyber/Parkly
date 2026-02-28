import Foundation
import MapKit

struct ParkingSpot: Identifiable, Codable, Equatable {
    let id: String
    var coordinate: Coordinate
    var status: SpotStatus
    var updatedAt: Date

    enum SpotStatus: String, Codable, CaseIterable {
        case available
        case occupied
    }
}

struct Coordinate: Codable, Equatable {
    var latitude: Double
    var longitude: Double

    var clLocation: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
