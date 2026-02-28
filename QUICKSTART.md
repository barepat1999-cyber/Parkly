# Quick Start Guide

## Hurtig Setup (5 minutter)

### 1. Installer dependencies
```bash
npm install
```

### 2. Opsæt Firebase
1. Gå til [Firebase Console](https://console.firebase.google.com/)
2. Opret nyt projekt
3. Tilføj iOS og Android apps
4. Kopiér konfigurationen til `.env` filen

### 3. Opsæt Google Maps
1. Gå til [Google Cloud Console](https://console.cloud.google.com/)
2. Aktiver Maps SDK for Android og iOS
3. Opret API nøgle
4. Tilføj til `.env` som `GOOGLE_MAPS_API_KEY`

### 4. Kør appen
```bash
npm start
```

Tryk `i` for iOS simulator eller `a` for Android emulator.

## Vigtige Filer

- `App.tsx` - Root component
- `src/screens/MapScreen.tsx` - Hovedkort
- `src/services/firestore.ts` - Database operations
- `src/domain/confidence.ts` - Business logic
- `.env` - Environment variables (ikke i git)

## Test Domain Logic

```bash
npm test
```

## Næste Skridt

Se `README.md` for fuld dokumentation og `TODOS.md` for næste fase features.
