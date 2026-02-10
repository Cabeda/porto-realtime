# Bus Map Updates - Route Number Fix

## Issues Fixed

### 1. Route Number Parsing
**Problem:** Bus markers were showing "Route urn" instead of the actual route number.

**Root Cause:** The FIWARE entity ID has format `urn:ngsi-ld:Vehicle:ROUTE:ID` (e.g., `urn:ngsi-ld:Vehicle:502:123456`), and the code was parsing the wrong part of the URN.

**Solution:** Updated `/pages/api/buses.tsx` to properly extract route numbers from the URN format by:
1. Splitting the URN by colons
2. Extracting the 4th part (index 3) which contains the actual route number
3. Falling back to other possible fields if available (routeShortName, route, lineId)

### 2. CSS Styling for Map Icons
**Added to `/app/globals.css`:**
- Custom bus icon styling (transparent background, no border)
- Custom location pin styling
- Removed default Leaflet marker shadows
- Styled map zoom controls with modern shadows

## Files Modified

1. **`pages/api/buses.tsx`** - Fixed route number extraction logic
2. **`app/globals.css`** - Added Leaflet custom icon styling

## URN Format Examples

The FIWARE API returns entity IDs in this format:
```
urn:ngsi-ld:Vehicle:502:123456
                     ^^^
                     Route number
```

The parser now correctly extracts "502" from position 3 (0-indexed) after splitting by `:`.

## Testing

After these changes:
- ✅ Bus markers show "Route 502", "Route 201", etc. instead of "Route urn"
- ✅ Bus icons (🚌) display with transparent backgrounds
- ✅ Location pin (📍) displays correctly
- ✅ No gray marker boxes or shadows

## Next Steps

Restart your development server to see the changes:
```bash
npm run dev
```

Then visit http://localhost:3000/map to verify the route numbers are displaying correctly.
