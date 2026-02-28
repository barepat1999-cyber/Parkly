import SwiftUI

struct ProfileTabView: View {
    @EnvironmentObject var store: ParklyStore
    @State private var showResetAlert = false
    @State private var isResetting = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                StatCard(value: "\(store.totalReports)", label: "Total Reports", description: "All-time reports made")
                StatCard(value: "\(store.dayStreak)", label: "Day Streak", description: "Consecutive days with reports")

                Button(action: { showResetAlert = true }) {
                    Text("Reset local data")
                        .fontWeight(.semibold)
                        .foregroundColor(.red)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.white)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                        )
                }
                .disabled(isResetting)
                .padding(.top, 8)
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .alert("Reset local data", isPresented: $showResetAlert) {
            Button("Annuller", role: .cancel) {}
            Button("Slet", role: .destructive) {
                isResetting = true
                store.resetAndRegenerate()
                isResetting = false
            }
        } message: {
            Text("Er du sikker på at du vil slette alle rapporter og spots? Demo spots vil blive regenereret.")
        }
    }
}

struct StatCard: View {
    let value: String
    let label: String
    let description: String

    var body: some View {
        VStack(spacing: 8) {
            Text(value)
                .font(.system(size: 48, weight: .bold))
                .foregroundColor(Color(red: 0.13, green: 0.59, blue: 0.95))
            Text(label)
                .font(.headline)
            Text(description)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(Color.white)
        .cornerRadius(12)
    }
}
