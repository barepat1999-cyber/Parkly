import Foundation

extension DateFormatter {
    static let parklyTime: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f
    }()

    static let parklyDateLabel: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "da_DK")
        f.dateFormat = "EEE dd/MM"
        return f
    }()
}

extension Date {
    var parklyTimeString: String { DateFormatter.parklyTime.string(from: self) }
    var parklyDateLabel: String { DateFormatter.parklyDateLabel.string(from: self) }

    static func formatDateLabel(_ date: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "i dag" }
        if cal.isDateInYesterday(date) { return "i går" }
        return date.parklyDateLabel
    }
}
