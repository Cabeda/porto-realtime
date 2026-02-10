# Fix: Line Number Parsing from FIWARE

## Issue

Line numbers showing "porto" instead of actual route numbers (205, 502, etc.)

## Root Cause

The FIWARE entity ID format is likely: `urn:ngsi-ld:Vehicle:porto:205:123456`

Our original parsing was taking `parts[3]` which would be "porto" instead of "205"

## Solution

Updated route number extraction logic in `pages/api/buses.tsx`:

### New Parsing Logic

1. **Try standard field names first:**
   - `routeShortName`
   - `route`
   - `lineId`
   - `line`

2. **Parse URN with smart filtering:**
   - Split by colons
   - Skip "Vehicle" and "porto"
   - Look for numeric/alphanumeric patterns (1-4 chars)
   - Match patterns like: `205`, `502`, `ZM`

3. **Fallback:**
   - Use second-to-last part of URN if nothing found

### Enhanced Debug Logging

Added detailed console output showing:
- Entity IDs
- Available field keys
- Full entity structure
- Multiple entity samples

## Expected Entity ID Formats

The parser now handles:
```
urn:ngsi-ld:Vehicle:205:123456           → 205
urn:ngsi-ld:Vehicle:porto:205:123456     → 205
urn:ngsi-ld:Vehicle:porto:502:abcd       → 502
urn:ngsi-ld:Vehicle:ZM:123               → ZM
```

## Regex Pattern

```javascript
/^[A-Z0-9]{1,4}$/i
```

Matches:
- ✅ 205, 502, 901 (numeric routes)
- ✅ ZM, ZC (zone routes)
- ✅ 9B, 10A (alphanumeric)
- ❌ porto, Vehicle (excluded)

## Testing

1. **Restart dev server** (to apply API changes)
2. **Check console** for debug output showing entity structure
3. **Visit map** at http://localhost:3000/map
4. **Click any bus** - should show "Linha: 205" not "Linha: porto"
5. **Check markers** - line numbers should appear inside bus icons

## Debug Output Example

In your terminal, you should see:
```
=== FIWARE Entity Sample ===
First entity ID: urn:ngsi-ld:Vehicle:porto:205:123456
First entity keys: ['id', 'type', 'location', 'speed', ...]
Full first entity: {
  "id": "urn:ngsi-ld:Vehicle:porto:205:123456",
  "location": { ... },
  "routeShortName": { "value": "205" },  ← Or whatever field has it
  ...
}
===========================
```

## If Still Not Working

Check the console output and look for:
1. **Field name** that contains the route number
2. **Entity ID format** to adjust parsing
3. Update the extraction logic accordingly

## Alternative Field Names to Check

If the standard fields don't work, look for:
- `linea`
- `linha`
- `ruta`
- `routeCode`
- `routeNumber`
- `tripShortName`

Add these to the extraction logic if found.
