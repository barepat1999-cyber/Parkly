import SwiftUI
import MapKit

/// MKMapView-based map with clustering disabled so each spot renders individually.
/// Uses MKStandardMapConfiguration to avoid satellite.styl resource lookup (MapKit internal).
struct UnclusteredMapView: UIViewRepresentable {
    @Binding var region: MKCoordinateRegion
    let spots: [ParkingSpot]
    let selectedSpotId: String?
    let onSpotTap: (String) -> Void
    var mapType: MapType = .standard

    enum MapType {
        case standard
        case satellite
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(region: $region, onSpotTap: onSpotTap)
    }

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView()
        mapView.delegate = context.coordinator
        mapView.region = region
        mapView.showsUserLocation = false
        applyMapType(mapType, to: mapView)
        return mapView
    }

    /// Apply map type with safe fallback: use system APIs, never load custom .styl files.
    private func applyMapType(_ type: MapType, to mapView: MKMapView) {
        if #available(iOS 16.0, *) {
            switch type {
            case .standard:
                mapView.preferredConfiguration = MKStandardMapConfiguration()
            case .satellite:
                mapView.preferredConfiguration = MKImageryMapConfiguration()
            }
        } else {
            mapView.mapType = type == .satellite ? .satellite : .standard
        }
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        mapView.region = region
        applyMapType(mapType, to: mapView)

        let toRemove = mapView.annotations.compactMap { $0 as? SpotMapAnnotation }
        mapView.removeAnnotations(toRemove)

        let annotations = spots.map { spot in
            SpotMapAnnotation(
                spotId: spot.id,
                coordinate: spot.coordinate.clLocation,
                status: spot.status,
                isSelected: spot.id == selectedSpotId
            )
        }
        mapView.addAnnotations(annotations)
    }

    class Coordinator: NSObject, MKMapViewDelegate {
        var region: Binding<MKCoordinateRegion>
        let onSpotTap: (String) -> Void

        init(region: Binding<MKCoordinateRegion>, onSpotTap: @escaping (String) -> Void) {
            self.region = region
            self.onSpotTap = onSpotTap
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let spotAnnotation = annotation as? SpotMapAnnotation else { return nil }

            let identifier = "SpotAnnotation"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier)
                ?? MKAnnotationView(annotation: annotation, reuseIdentifier: identifier)

            view.annotation = spotAnnotation
            view.canShowCallout = false
            view.isEnabled = true
            view.clusteringIdentifier = spotAnnotation.spotId
            if #available(iOS 11.0, *) {
                view.displayPriority = .required
            }

            let size: CGFloat = spotAnnotation.isSelected ? 24 : 20
            let color = spotAnnotation.status == .available
                ? UIColor(red: 0.3, green: 0.69, blue: 0.31, alpha: 1)
                : UIColor(red: 0.96, green: 0.26, blue: 0.21, alpha: 1)

            view.frame = CGRect(x: 0, y: 0, width: size, height: size)
            view.backgroundColor = color
            view.layer.cornerRadius = size / 2
            view.layer.borderWidth = spotAnnotation.isSelected ? 3 : 2
            view.layer.borderColor = (spotAnnotation.isSelected ? UIColor.systemBlue : UIColor.white).cgColor

            return view
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            guard let spotAnnotation = view.annotation as? SpotMapAnnotation else { return }
            onSpotTap(spotAnnotation.spotId)
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            region.wrappedValue = mapView.region
        }
    }
}
