# Parkly Cloud Functions – Parking Intelligence Layer v1

## Overview

- **onReportCreated**: Firestore trigger on `reports` collection. Adds `geohash`, `zoneId`, `createdAt`; creates/updates zones (100m clustering).
- **getZonesNear**: Callable function. Returns zones within `radiusMeters` of `(lat, lng)`, sorted by `confidenceScore` descending.

## Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Run emulators (Firestore + Functions)
firebase emulators:start --only functions

# Deploy
firebase deploy --only functions
```

## Zone Logic

- Reports within 100m are clustered into the same zone.
- `confidenceScore = 1 * (1 + log(reportCount + 1))`
- Zone fields: `centerLat`, `centerLng`, `reportCount`, `freeCountRecent`, `occupiedCountRecent`, `confidenceScore`, `lastUpdated`
