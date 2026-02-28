import Foundation

/// Runs periodic random status flips on spots to simulate cars arriving/leaving
final class Simulation {
    private var timer: Timer?
    private let interval: TimeInterval
    private let flipsPerTick: Int
    private var onTick: (() -> Void)?

    init(interval: TimeInterval = 1.5, flipsPerTick: Int = 3) {
        self.interval = interval
        self.flipsPerTick = flipsPerTick
    }

    func setOnTick(_ handler: @escaping () -> Void) {
        onTick = handler
    }

    func start() {
        stop()
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.onTick?()
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }
}
