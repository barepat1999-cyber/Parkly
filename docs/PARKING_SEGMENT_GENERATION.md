# Parking Segment Generation in PARKLY

## Overview

PARKLY generates parking segments automatically from OpenStreetMap (OSM) road data for Copenhagen streets. Segments are computed on-demand, not persisted. Manual (curated) segments override generated ones.

---

## 1. Where Generation Happens

**Primary location:** `src/services/parkingInventoryService.ts`

### Flow

```
getParkingSegmentsInRegion(region)
    │
    ├─► getCopenhagenParkingSegments(region)  [Copenhagen API + bundled zones]
    ├─► fetchOsmSegments(region)             [Overpass API → OSM ways]
    │       │
    │       └─► wayToSegments()             [Split roads into 50–100 m chunks]
    │       └─► estimateSpotsFromLength()    [1 spot per 6 m]
    │
    └─► Merge: static/copenhagen first, then generated (with override)
```

### Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `fetchOsmSegments` | `parkingInventoryService.ts` | Fetch OSM ways via Overpass API |
| `wayToSegments` | `parkingInventoryService.ts` | Split polyline into 75 m segments (~50–100 m) |
| `estimateSpotsFromLength` | `parkingInventoryService.ts` | `totalSpots = lengthM / 6` |
| `getParkingSegmentsInRegion` | `parkingInventoryService.ts` | Orchestrates fetch + merge |

### OSM Query

- **Endpoint:** `https://overpass-api.de/api/interpreter`
- **Road types:** residential, primary, secondary, tertiary, unclassified, service, living_street, trunk
- **Bbox:** Map viewport (region bounds)

---

## 2. How Segments Are Stored

Segments are **not stored**. They are computed in memory on each fetch:

- No database
- No local cache (beyond React state)
- Regenerated when the user pans the map or focuses the Map tab

### Segment Model

```ts
{
  id: string;                    // e.g. "generated-12345-0"
  streetName: string;            // From OSM tags or "Vej {wayId}"
  coordinates: { lat, lng }[];   // Polygon (4 points) for rendering
  centerline: { lat, lng }[];    // Road centerline
  totalSpots: number;            // floor(segmentLengthM / 6)
  estimatedFreeSpots: number;    // totalSpots * 0.5
  estimatedOccupiedSpots: number;
  source: "generated";           // | "copenhagen" | "osm" | "mock"
  lastUpdated: number;
  confidence: 0.4;
}
```

---

## 3. How the Map Renders Them

**Component:** `src/components/ParkingInventoryLayer.tsx`

- **Rendering:** Each segment is a thin green `Polygon` (4-point buffer around centerline)
- **Color:** `rgba(76, 175, 80, 0.55)` for `source === 'generated'`
- **Badge:** `totalSpots` shown at segment midpoint (always visible)
- **Tap:** Opens modal with street name, total spots, estimated free/occupied, confidence

**Integration:** `app/(tabs)/map.tsx`

- `inventorySegments` state holds segments
- Fetched on Map tab focus and on `onRegionChangeComplete`
- Client-side fallback: `ensureCopenhagenSegments()` adds static segments when view has few results

---

## 4. Manual Override

**Rule:** Manual (curated) segments override generated ones.

- **Manual sources:** Copenhagen API, bundled zones, `STATIC_COPENHAGEN_SEGMENTS`
- **Generated:** OSM-derived segments (`source: 'generated'`)

**Logic:** Before adding a generated segment, we check if its midpoint is within 50 m of any manual segment. If so, the generated segment is skipped.

---

## 5. Configuration

| Constant | Value | Meaning |
|----------|-------|---------|
| `SEGMENT_LENGTH_M` | 75 | Target segment length (50–100 m range) |
| `METERS_PER_SPOT` | 6 | 1 parking spot per 6 m of road |
| `ROAD_BUFFER_M` | 3 | Polygon width each side of centerline |
| `OVERRIDE_RADIUS_M` | 50 | Skip generated if manual segment within this distance |
