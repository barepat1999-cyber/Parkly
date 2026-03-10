# Parkly - Parkerings App MVP

Parkly er en crowd-sourced parkeringsapp der kombinerer brugerrapporter med offentlige p-hus data for at vise real-time tilgængelighed af parkeringspladser.

## Features (MVP)

- 🗺️ Interaktivt kort med farvekodede parkeringsmarkører (grøn/gul/rød)
- 📍 Crowd-sourced rapportering (1-klik "Ledig" eller "Optaget")
- 🏢 Integration med offentlige p-hus data (mock provider i MVP)
- 📊 Confidence scoring baseret på rapporter og tid
- 📱 Tre hovedskærme: Kort, Historik, Profil
- 🔐 Firebase anonym authentication (klar til email upgrade)
- ⚡ Optimistisk UI updates med rollback ved fejl

## Tech Stack

- **Framework**: React Native (Expo)
- **Language**: TypeScript
- **Maps**: react-native-maps (Google Maps)
- **Backend**: Firebase (Auth + Firestore)
- **Navigation**: React Navigation (Bottom Tabs)
- **Testing**: Jest

## Setup

### 1. Installer dependencies

```bash
npm install
```

### 2. Opsæt Firebase

1. Opret et nyt projekt i [Firebase Console](https://console.firebase.google.com/)
2. Tilføj en iOS og Android app til projektet
3. Kopiér Firebase konfigurationen
4. Opret en `.env` fil baseret på `.env.example`:

```bash
cp .env.example .env
```

5. Udfyld Firebase credentials i `.env` filen

**Firestore Rules & Index:**
- Deploy `firestore.rules` til Firebase (Firebase Console → Firestore → Rules)
- Ved første kørsel kan Firestore bede om et composite index for `reports`: `createdAt` (asc) + `createdAt` (desc). Følg linket i fejlbeskeden for at oprette det.

### Firebase Cloud Functions (Parking Intelligence Layer v1)

Functions ligger i `functions/` og kører som backend-triggers og callable functions.

**Kør emulatorer (Firestore + Functions) med persistence:**
```bash
npm run emulators:start
```
Firestore-data gemmes i `./emulator-data` og genindlæses ved næste start. Data overlever genstarter.

- Firestore: `127.0.0.1:8080`
- Functions: `127.0.0.1:5001`
- Emulator UI: `http://127.0.0.1:4000`

Ryd eksisterende data: `npm run emulators:clear`

**Test getZonesNear via curl:**
```bash
curl -X POST 'http://127.0.0.1:5001/demo-project/us-central1/getZonesNear' \
  -H 'Content-Type: application/json' \
  -d '{"data":{"lat":55.6761,"lng":12.5683,"radiusMeters":500}}'
```
(Erstat `demo-project` med dit project ID fra `.firebaserc`.)

**Test via app:**
1. Start emulatorer: `npm run emulators:start`
2. Start app: `npm start` eller `npm run ios`
3. Åbn Map-fanen, tryk **"Test getZonesNear"**
4. Tjek Alert + overlay "Zones: X" + Metro/emulator logs

**Deploy til Firebase:**
```bash
firebase deploy --only functions
```

Sørg for at `.firebaserc` peger på dit Firebase-projekt (opdater `default` med dit project ID).

### App + Emulator (DEV)

I `__DEV__` forbinder appen automatisk til Firestore og Functions emulator på `127.0.0.1` (iOS Simulator).

**Fysisk enhed:** Sæt `EXPO_PUBLIC_EMULATOR_HOST` i `.env` til din Mac's lokale IP:

```bash
# .env (kun på fysisk enhed – iOS Simulator bruger 127.0.0.1)
EXPO_PUBLIC_EMULATOR_HOST=192.168.1.100
```

Find din IP med `ifconfig | grep "inet "` (Wi‑Fi).

### 3. Opsæt Google Maps API

1. Opret et projekt i [Google Cloud Console](https://console.cloud.google.com/)
2. Aktiver Maps SDK for Android og Maps SDK for iOS
3. Opret en API nøgle
4. Tilføj API nøglen til `.env` filen som `GOOGLE_MAPS_API_KEY`
5. Tilføj også API nøglen til `app.json` under `ios.config.googleMapsApiKey` og `android.config.googleMaps.apiKey`

### 4. Kør appen

```bash
# Start Expo development server
npm start

# Eller kør direkte på enhed
npm run ios     # iOS simulator
npm run android # Android emulator
```

#### Kør via Xcode (iOS)

Projektet har en `ios/` mappe med native build. I **Debug**-konfiguration henter appen JavaScript-bundlen fra Metro (packager). Metro skal derfor køre **før** du bygger og kører fra Xcode.

**Step-by-step:**

1. **Start Metro med ryddet cache** (én kommando, lad terminalen køre):
   ```bash
   npm run start:clear
   ```
2. **Åbn Xcode** og byg/kør appen:
   - Åbn `ios/Parkly.xcworkspace` i Xcode (brug `.xcworkspace`, ikke `.xcodeproj`)
   - Vælg simulator eller fysisk enhed
   - Tryk **Cmd+R** (Run)

**Hvis du får "No bundle URL present. Make sure you're running a packager server..."**

- **Årsag:** Appen i Debug forsøger at hente JS-bundlen fra Metro, men Metro kører ikke.
- **Løsning:**
  1. I en terminal i projektroden: `npm run start:clear`
  2. Vent til du ser "Metro waiting on …" (eller tilsvarende)
  3. Kør derefter **Cmd+R** i Xcode igen.
- Hvis fejlen fortsat opstår: luk Xcode, stop Metro (Ctrl+C), kør `npm run start:clear` igen, åbn Xcode og kør Cmd+R.

## Projektstruktur

```
parkly/
├── src/
│   ├── config/
│   │   └── firebase.ts          # Firebase initialisering
│   ├── domain/
│   │   ├── confidence.ts        # Domain logic (confidence, status, decay)
│   │   └── __tests__/           # Unit tests
│   ├── navigation/
│   │   └── AppNavigator.tsx     # Navigation setup
│   ├── screens/
│   │   ├── MapScreen.tsx        # Hovedkort med markers
│   │   ├── HistoryScreen.tsx    # Brugerrapporter
│   │   └── ProfileScreen.tsx    # Profil og indstillinger
│   ├── services/
│   │   ├── auth.ts              # Firebase Auth wrapper
│   │   ├── firestore.ts         # Firestore operations
│   │   └── providers.ts         # Provider interface (mock)
│   └── types/
│       └── index.ts             # TypeScript typer
├── App.tsx                       # Root component
├── package.json
├── tsconfig.json
└── README.md
```

## Firestore Struktur

### Collections

**`/spots/{spotId}`**
```typescript
{
  lat: number;
  lng: number;
  type: "street" | "garage";
  status: "likely_free" | "uncertain" | "occupied";
  confidence: number; // 0.0 - 1.0
  lastUpdated: Timestamp;
  pricePerHour?: number;
  source: "crowd" | "provider";
  providerId?: string;
  availableSpaces?: number;
}
```

**`/reports/{reportId}`** (Parkly crowd reports)
```typescript
{
  userId: string;
  lat: number;
  lon: number;
  status: "free" | "occupied";
  createdAt: serverTimestamp();
  dayKey: string;  // YYYY-MM-DD
}
```

**`/users/{userId}`**
```typescript
{
  karma: number;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
}
```

## Domain Logic

### Confidence Scoring

- **Free report**: Øger confidence (mod 1.0)
- **Occupied report**: Sænker confidence (mod 0.0)
- **Time decay**: Confidence falder eksponentielt over tid (halvering hver 20 min)

### Status Beregning

- **Grøn (likely_free)**: confidence ≥ 0.7 og ≤ 10 min siden opdatering
- **Gul (uncertain)**: confidence 0.4-0.69 eller 10-20 min siden opdatering
- **Rød (occupied)**: confidence < 0.4 eller > 20 min siden opdatering

## Test Backend Sync (Firestore)

1. Sørg for Firebase er konfigureret (`.env` med `EXPO_PUBLIC_FIREBASE_*`)
2. Deploy `firestore.rules` til Firebase Console
3. Start appen på to devices/simulators (eller samme simulator med to instanser)
4. På device A: Tryk "Ledig plads" eller "Optaget" på Map
5. På device B: Rapporten dukker op uden refresh (real-time sync)
6. Tjek Profile: Total Reports og Day Streak matcher dine rapporter
7. Genstart appen: Data overlever (Firestore + offline cache)

## Tilføj Rigtig Provider API

For at erstatte mock provideren med rigtig data:

1. Opret en ny provider klasse i `src/services/providers.ts`:

```typescript
class MunicipalParkingProvider implements ParkingProvider {
  id = 'municipal-copenhagen';
  name = 'Københavns Kommune';

  async fetchSpots(): Promise<Omit<Spot, 'id' | 'status' | 'confidence' | 'lastUpdated'>[]> {
    const response = await fetch('https://api.example.com/parking');
    const data = await response.json();
    
    return data.map((item: any) => ({
      lat: item.latitude,
      lng: item.longitude,
      type: 'garage' as SpotType,
      source: 'provider' as Source,
      providerId: this.id,
      pricePerHour: item.price,
      availableSpaces: item.available,
    }));
  }
}
```

2. Tilføj provideren til `providers` arrayet:

```typescript
const providers: ParkingProvider[] = [
  new MockParkingProvider(),
  new MunicipalParkingProvider(), // Ny provider
];
```

3. Provider spots synkroniseres automatisk når `syncProviderSpots()` kaldes (f.eks. ved app start eller refresh).

## Testing

```bash
npm test
```

Tests er placeret i `src/domain/__tests__/` og dækker domain logic funktioner.

### Kort testguide: Report på map center (simulator)

1. Start appen i iOS simulator: `npm run ios`
2. Søg "København" i søgefeltet og tryk Enter – kortet centreres på København
3. Tryk **Ledig plads** eller **Optaget** – rapporten gemmes på kortets center (København)
4. Tjek at markøren vises i København (ca. 55.68, 12.57)
5. Tryk på markøren – modal viser København-koordinater
6. Tryk **Navigér hertil** – Apple Maps åbner med København som destination
7. Gå til **Historik** – rapporten viser København lat/lon

## Deployment

### iOS

```bash
# Build for iOS
eas build --platform ios

# Eller submit til App Store
eas submit --platform ios
```

### Android

```bash
# Build for Android
eas build --platform android

# Eller submit til Google Play
eas submit --platform android
```

Bemærk: Du skal have EAS CLI installeret (`npm install -g eas-cli`) og være logget ind.

## TODO - Næste Fase

1. **Rigtige Provider APIs**: Erstat mock provider med rigtige kommunale/private API'er
2. **Betalingsflow**: Integrér betaling for premium features eller p-hus betaling
3. **Push Notifikationer**: Notificér brugere når nye pladser er tilgængelige i nærheden
4. **Private Spots Marketplace**: Tillad brugere at udleje private parkeringspladser
5. **Geo Queries**: Implementér GeoFirestore for effektive radius queries i stedet for client-side filtering
6. **Email Auth**: Opgradér fra anonym auth til email/password login
7. **Karma System**: Implementér bonus karma når andre bekræfter ens rapporter
8. **Offline Support**: Cache spots lokalt og sync når online
9. **Analytics**: Tilføj Firebase Analytics for brugsmønstre
10. **Deep Linking**: Forbedr navigation deep links til Apple/Google Maps

## Licens

Privat projekt - Alle rettigheder forbeholdes.
