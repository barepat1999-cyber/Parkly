import Foundation

struct Report: Identifiable, Codable, Equatable {
    let id: String
    let type: ReportType
    let timestamp: Date
    let spotId: String
    let coordinate: Coordinate

    enum ReportType: String, Codable, CaseIterable {
        case available
        case occupied
    }
}
