# Parking detection state machine

## States

| State | Meaning |
|-------|---------|
| **idle** | No active session; user is not classified as being at a mapped bay, or we just finished leaving. |
| **near_bay** | User is within match radius of a bay centerline but we have not yet decided they are stopping (dwell timer running or still moving). |
| **suspected_parking** | User has stayed roughly still long enough near a bay; we may show **one** arrival prompt (alert / notification). Waiting for confirm / reject. |
| **parked** | User confirmed parking (or restored session); active session tied to that bay. |
| **suspected_leaving** | Session active; user appears outside the “leave” distance; we may show **one** leave prompt. |
| **left** | Brief (≈2s) after confirmed leave or auto-release; map shows bay as free, then returns to **idle**. |

## Main transitions

- `idle` → `near_bay`: enter bay radius (no session).
- `near_bay` → `suspected_parking`: dwell + low speed threshold met → single arrival prompt (respecting per-bay reject cooldown + global gap).
- `suspected_parking` → `parked`: user confirms parking.
- `suspected_parking` → `near_bay`: user rejects → **cooldown** before we ask again for that bay.
- `parked` → `suspected_leaving`: session active; GPS shows user outside leave distance (debounced).
- `suspected_leaving` → `parked`: user says still parked → **leave cooldown** before another leave prompt.
- `suspected_leaving` → `left`: user confirms left (or auto-release when enabled).
- `left` → `idle`: short timer; session cleared, bay marked free.

Cooldowns and thresholds live in `src/constants/parkingDetection.ts`.
