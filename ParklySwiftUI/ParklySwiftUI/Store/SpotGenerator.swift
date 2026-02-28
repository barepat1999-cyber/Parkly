import Foundation
import MapKit

enum SpotGenerator {
    static let copenhagenCenter = CLLocationCoordinate2D(latitude: 55.6761, longitude: 12.5683)
    static let columns = 12
    static let rows = 10
    /// Spacing in degrees between spots – clearly separated (~16.5m at Copenhagen)
    static let spacingLat: Double = 0.00015
    static let spacingLon: Double = 0.00015

    /// Generate exactly 120 spots in 12×10 grid. 70% available, 30% occupied.
    static func generateDemoGarage(center: CLLocationCoordinate2D) -> [ParkingSpot] {
        var spots: [ParkingSpot] = []
        var idx = 0
        let now = Date()
        for row in 0..<rows {
            for col in 0..<columns {
                let offsetLat = (Double(row) - Double(rows - 1) / 2) * spacingLat
                let offsetLon = (Double(col) - Double(columns - 1) / 2) * spacingLon
                let lat = center.latitude + offsetLat
                let lon = center.longitude + offsetLon
                let status: ParkingSpot.SpotStatus = Double.random(in: 0..<1) < 0.7 ? .available : .occupied
                spots.append(ParkingSpot(
                    id: "spot-\(idx)",
                    coordinate: Coordinate(latitude: lat, longitude: lon),
                    status: status,
                    updatedAt: now
                ))
                idx += 1
            }
        }
        return spots
    }
}
