# Bus Information Display Improvements

## Changes Made

### 1. Enhanced Bus Popup UI (app/map/page.tsx)

**Before:**

- Small route number text
- Plain layout
- Equal emphasis on all info

**After:**

- **Prominent line number** with blue badge (e.g., `502`)
- **Direction/destination** displayed inline with arrow (e.g., `→ Hospital São João`)
- **Better visual hierarchy**: Line info is most prominent, then destination, then technical details
- **Improved formatting**:
  - Speed shows "Stopped" when 0 km/h
  - Speed rounded to integer (cleaner display)
  - Better spacing and borders
- **Fallback message**: Shows "Destination not available" when API doesn't provide it

**New Layout:**

```
┌────────────────────────────┐
│ [502] → Hospital São João  │  ← Line + Destination (prominent)
├────────────────────────────┤
│ Speed:     15 km/h         │  ← Technical info (smaller)
│ Heading:   90°             │
├────────────────────────────┤
│ Last updated: 3:45:32 PM   │  ← Timestamp (smallest)
└────────────────────────────┘
```

### 2. Improved API Field Extraction (pages/api/buses.tsx)

Added more field name variations for destination/direction:

- `routeLongName` (standard)
- `destination`
- `tripHeadsign`
- `headsign` ← NEW
- `direction` ← NEW
- `directionId` ← NEW

### 3. Debug Logging

Added console.log in the API to output sample FIWARE entity structure. This helps identify:

- What fields are actually available
- Field names used by Porto's FIWARE instance
- Data format and structure

## Testing the Changes

1. **Refresh the map page**: http://localhost:3000/map
2. **Click any bus marker** to see the new popup format
3. **Check server console** for FIWARE entity structure:
   ```bash
   # Look for this in your terminal:
   Sample FIWARE entity: { ... }
   ```

## What to Look For

### If destination shows correctly:

✅ Perfect! The FIWARE API provides destination data.

### If "Destination not available" appears:

⚠️ The FIWARE API might use different field names. Check the console log to see what fields are available and update the API parsing logic accordingly.

## Next Steps (If Destination Missing)

If the destination is still not showing:

1. **Check console output** for the FIWARE entity structure
2. **Identify the field** that contains destination/headsign
3. **Update** `pages/api/buses.tsx` to include that field name
4. **Restart server** and test again

## Alternative: Get Destination from GTFS

If FIWARE doesn't provide destination, we could:

1. Cross-reference with the OTP GraphQL API (already used for stations)
2. Match route number to GTFS trip data
3. Get destination from trip headsign

This would require an additional API call but would provide complete route information.

## Visual Comparison

**Before:**

```
🚌 Route 502
→ [blank if no data]
Direction: 90°
Speed: 15.0 km/h
```

**After:**

```
[502] → Hospital São João
─────────────────────────
Speed:     15 km/h
Heading:   90°
─────────────────────────
Last updated: 3:45 PM
```

Much cleaner and more informative!
