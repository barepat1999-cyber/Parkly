import Foundation
import SwiftUI
import MapKit

@MainActor
final class ParklyStore: ObservableObject {
    @Published var spots: [ParkingSpot] = []
    @Published var reports: [Report] = []
    @Published var selectedSpotId: String?
    @Published var showSelectSpotToast = false
    @Published var mapCenter: CLLocationCoordinate2D?

    private static let defaultCopenhagenCenter = CLLocationCoordinate2D(latitude: 55.6761, longitude: 12.5683)
    private let forceDemoGarageOnLaunch = true
    private let simulation: Simulation
    private var saveDebounce: Task<Void, Never>?

    init() {
        simulation = Simulation(interval: 1.5, flipsPerTick: 4)
        load()
        if forceDemoGarageOnLaunch {
            generateDemoGarage(center: Self.defaultCopenhagenCenter)
            Persistence.saveSpots(spots)
        } else if spots.isEmpty {
            generateDemoGarage(center: Self.defaultCopenhagenCenter)
            Persistence.saveSpots(spots)
        }
        print("Init spots count:", spots.count)
        simulation.setOnTick { [weak self] in
            Task { @MainActor in
                self?.simulateTick()
            }
        }
        simulation.start()
    }

    /// Self-healing: if spots is empty, generate and persist. No location permission needed.
    func ensureDemoGarageLoaded() {
        if spots.isEmpty {
            generateDemoGarage(center: Self.defaultCopenhagenCenter)
            Persistence.saveSpots(spots)
        }
    }

    deinit {
        simulation.stop()
    }

    var selectedSpot: ParkingSpot? {
        guard let id = selectedSpotId else { return nil }
        return spots.first { $0.id == id }
    }

    var totalReports: Int { reports.count }

    var dayStreak: Int {
        let calendar = Calendar.current
        var streak = 0
        var check = calendar.startOfDay(for: Date())
        let sorted = reports.sorted { $0.timestamp > $1.timestamp }
        let uniqueDays = Set(sorted.map { calendar.startOfDay(for: $0.timestamp) })

        while uniqueDays.contains(check) {
            streak += 1
            guard let prev = calendar.date(byAdding: .day, value: -1, to: check) else { break }
            check = prev
        }
        return streak
    }

    func filteredReports(_ filter: ReportFilter) -> [Report] {
        switch filter {
        case .all: return reports
        case .available: return reports.filter { $0.type == .available }
        case .occupied: return reports.filter { $0.type == .occupied }
        }
    }

    enum ReportFilter: String, CaseIterable {
        case all = "All"
        case available = "Ledig"
        case occupied = "Optaget"
    }

    // MARK: - Actions

    func selectSpot(_ id: String?) {
        selectedSpotId = id
    }

    func reportAvailable() {
        guard let spot = selectedSpot else {
            showSelectSpotToast = true
            return
        }
        setSpotStatus(spot.id, .available)
        addReport(type: .available, spotId: spot.id, coordinate: spot.coordinate)
    }

    func reportOccupied() {
        guard let spot = selectedSpot else {
            showSelectSpotToast = true
            return
        }
        setSpotStatus(spot.id, .occupied)
        addReport(type: .occupied, spotId: spot.id, coordinate: spot.coordinate)
    }

    func updateMapCenter(_ center: CLLocationCoordinate2D) {
        mapCenter = center
    }

    /// Generate 120 spots in 12×10 grid around center. Replaces spots array.
    /// Does NOT depend on location permission – always uses provided center.
    func generateDemoGarage(center: CLLocationCoordinate2D) {
        spots = SpotGenerator.generateDemoGarage(center: center)
        Persistence.saveSpots(spots)
        print("Generated spots:", spots.count)
    }

    func resetAndRegenerate() {
        simulation.stop()
        Persistence.clearAll()
        spots = []
        reports = []
        selectedSpotId = nil
        generateDemoGarage(center: Self.defaultCopenhagenCenter)
        Persistence.saveSpots(spots)
        Persistence.saveReports(reports)
        simulation.start()
    }

    // MARK: - Private

    private func load() {
        spots = Persistence.loadSpots()
        reports = Persistence.loadReports()
    }

    private func simulateTick() {
        guard !spots.isEmpty else { return }
        let count = min(4, spots.count)
        let indices = Array(0..<spots.count).shuffled().prefix(count)
        for i in indices {
            var spot = spots[i]
            spot.status = spot.status == .available ? .occupied : .available
            spot.updatedAt = Date()
            spots[i] = spot
        }
        scheduleSaveSpots()
    }

    private func setSpotStatus(_ id: String, _ status: ParkingSpot.SpotStatus) {
        guard let idx = spots.firstIndex(where: { $0.id == id }) else { return }
        spots[idx].status = status
        spots[idx].updatedAt = Date()
        scheduleSaveSpots()
    }

    private func addReport(type: Report.ReportType, spotId: String, coordinate: Coordinate) {
        let report = Report(
            id: UUID().uuidString,
            type: type,
            timestamp: Date(),
            spotId: spotId,
            coordinate: coordinate
        )
        reports.insert(report, at: 0)
        scheduleSaveReports()
    }

    private func scheduleSaveSpots() {
        saveDebounce?.cancel()
        saveDebounce = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            Persistence.saveSpots(spots)
        }
    }

    private func scheduleSaveReports() {
        saveDebounce?.cancel()
        saveDebounce = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            Persistence.saveReports(reports)
        }
    }
}
