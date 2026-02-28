import Foundation

enum Persistence {
    private static let spotsKey = "parkly_spots"
    private static let reportsKey = "parkly_reports"

    static func loadSpots() -> [ParkingSpot] {
        guard let data = UserDefaults.standard.data(forKey: spotsKey),
              let decoded = try? JSONDecoder().decode([ParkingSpot].self, from: data) else {
            return []
        }
        return decoded
    }

    static func saveSpots(_ spots: [ParkingSpot]) {
        guard let data = try? JSONEncoder().encode(spots) else { return }
        UserDefaults.standard.set(data, forKey: spotsKey)
    }

    static func loadReports() -> [Report] {
        guard let data = UserDefaults.standard.data(forKey: reportsKey),
              let decoded = try? JSONDecoder().decode([Report].self, from: data) else {
            return []
        }
        return decoded
    }

    static func saveReports(_ reports: [Report]) {
        guard let data = try? JSONEncoder().encode(reports) else { return }
        UserDefaults.standard.set(data, forKey: reportsKey)
    }

    static func clearAll() {
        UserDefaults.standard.removeObject(forKey: spotsKey)
        UserDefaults.standard.removeObject(forKey: reportsKey)
    }
}
