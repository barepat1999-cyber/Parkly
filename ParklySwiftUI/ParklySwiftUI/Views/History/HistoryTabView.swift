import SwiftUI

struct HistoryTabView: View {
    @EnvironmentObject var store: ParklyStore
    @State private var filter: ParklyStore.ReportFilter = .all

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Menu {
                    ForEach(ParklyStore.ReportFilter.allCases, id: \.self) { f in
                        Button(f.rawValue) { filter = f }
                    }
                } label: {
                    HStack {
                        Text(filter.rawValue)
                            .fontWeight(.semibold)
                        Image(systemName: "chevron.down")
                            .font(.caption)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.white)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                    )
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 4)
                Spacer()
            }

            if store.filteredReports(filter).isEmpty {
                Text("No reports yet")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .italic()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding()
            } else {
                List {
                    ForEach(groupedReports(filter)) { group in
                        Section(header: Text(group.label).font(.headline)) {
                            ForEach(group.reports) { report in
                                ReportRow(report: report)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .background(Color(.systemGroupedBackground))
    }

    private func groupedReports(_ filter: ParklyStore.ReportFilter) -> [ReportGroup] {
        let filtered = store.filteredReports(filter)
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: filtered) { report -> String in
            let day = calendar.startOfDay(for: report.timestamp)
            if calendar.isDateInToday(day) { return "i dag" }
            if calendar.isDateInYesterday(day) { return "i går" }
            let formatter = DateFormatter()
            formatter.dateFormat = "EEE dd/MM"
            formatter.locale = Locale(identifier: "da_DK")
            return formatter.string(from: day)
        }
        return grouped.map { ReportGroup(label: $0.key, reports: $0.value.sorted { $0.timestamp > $1.timestamp }) }
            .sorted { g1, g2 in
                guard let r1 = g1.reports.first, let r2 = g2.reports.first else { return false }
                return r1.timestamp > r2.timestamp
            }
    }
}

struct ReportGroup: Identifiable {
    let label: String
    let reports: [Report]
    var id: String { label }
}

struct ReportRow: View {
    let report: Report

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Spot \(report.spotId)")
                    .font(.headline)
                Spacer()
                Text(report.type == .available ? "Ledig" : "Optaget")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(report.type == .available ? Color.green : Color.red)
                    .cornerRadius(4)
            }
            Text(String(format: "%.4f, %.4f", report.coordinate.latitude, report.coordinate.longitude))
                .font(.caption)
                .foregroundColor(.secondary)
            Text("\(Date.formatDateLabel(report.timestamp)) \(report.timestamp.parklyTimeString)")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}
