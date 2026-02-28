# Parkly SwiftUI – Digital Twin Parking

Native SwiftUI app med MapKit. Demo-garage med 120 spots omkring København, live simulation og rapporter.

## Kør appen

1. Åbn `ParklySwiftUI.xcodeproj` i Xcode
2. Vælg en iOS-simulator (f.eks. iPhone 17)
3. Tryk **⌘R** (Run)

## Kort testguide

1. **Map**: Se 120 farvede spots (grøn = ledig, rød = optaget). De skifter status hvert 1–2 sek.
2. **Vælg spot**: Tryk på en spot → bottom sheet viser id, status og opdateringstidspunkt
3. **Rapporter**: Vælg en spot, tryk **Ledig plads** eller **Optaget** → rapport oprettes
4. **Ingen spot valgt**: Tryk på en knap uden at vælge → toast: "Vælg en plads på kortet først"
5. **History**: Se rapporter med filter (All / Ledig / Optaget)
6. **Profile**: Total Reports, Day Streak, **Reset local data** → sletter alt og regenererer demo spots

## Projektstruktur

```
ParklySwiftUI/
├── ParklySwiftUI.xcodeproj/
├── ParklySwiftUI/
│   ├── Models/           ParkingSpot, Report
│   ├── Store/            ParklyStore, Persistence, SpotGenerator, Simulation
│   ├── Helpers/          DateFormatter+Parkly
│   ├── Views/
│   │   ├── Map/          MapTabView, SpotAnnotation
│   │   ├── History/      HistoryTabView
│   │   └── Profile/      ProfileTabView
│   ├── ParklySwiftUIApp.swift
│   └── ContentView.swift
```

## Persistence

Spots og rapporter gemmes i UserDefaults som JSON. Ved app-start hentes data; hvis tomt, genereres 120 demo spots omkring København (55.6761, 12.5683).
