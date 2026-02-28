import MapKit

/// MKAnnotation for a parking spot – used with MKMapView to disable clustering
final class SpotMapAnnotation: NSObject, MKAnnotation {
    let spotId: String
    let coordinate: CLLocationCoordinate2D
    let status: ParkingSpot.SpotStatus
    let isSelected: Bool

    init(spotId: String, coordinate: CLLocationCoordinate2D, status: ParkingSpot.SpotStatus, isSelected: Bool) {
        self.spotId = spotId
        self.coordinate = coordinate
        self.status = status
        self.isSelected = isSelected
    }
}
