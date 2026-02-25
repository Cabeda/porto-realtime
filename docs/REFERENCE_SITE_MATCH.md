# Bus Popup - Match Reference Site Format

## Changes Made

### Updated to Match: https://stcp.tiagoanoliveira.pt/

The bus popup now displays exactly like the reference site:

```
Linha: 205
Destino: Campanhã
Velocidade: 18 km/h
Veículo nº 1130
──────────────────
Atualizado: 3:45:32
```

### API Changes (pages/api/buses.tsx)

**1. Added Vehicle Number Extraction**

```typescript
interface Bus {
  // ... existing fields
  vehicleNumber: string; // NEW
}
```

Tries multiple field variations:

- `vehiclePlateIdentifier` (FIWARE standard)
- `vehicleNumber`
- `license_plate`
- `name`
- Last part of entity ID (fallback)

**2. Debug Logging**
Console logs the first entity to see actual FIWARE structure

### UI Changes (app/map/page.tsx)

**New Popup Format (Portuguese, matching reference):**

- **Linha**: Line number (bold, blue)
- **Destino**: Destination/final stop
- **Velocidade**: Speed (shows "Parado" when stopped)
- **Veículo nº**: Vehicle number
- **Atualizado**: Last update time (Portuguese format)

### Visual Comparison

**Before:**

```
[502] → Hospital São João
───────────────────────
Speed:     15 km/h
Heading:   90°
───────────────────────
Last updated: 3:45 PM
```

**After (matching reference):**

```
Linha: 502
Destino: Hospital São João
Velocidade: 15 km/h
Veículo nº 1234
───────────────────────
Atualizado: 15:45:32
```

## Key Features

1. **Portuguese Labels**: Matches Porto transit terminology
2. **Vehicle Number**: Shows fleet number for each bus
3. **Clean Format**: Simple, readable layout
4. **Smart Fallbacks**:
   - Shows "Parado" (Stopped) when speed is 0
   - Hides fields if data unavailable
5. **Portuguese Time**: Uses `toLocaleTimeString('pt-PT')`

## Testing

1. Refresh http://localhost:3000/map
2. Click any bus marker
3. Should see format matching the reference site

## Expected Data from FIWARE

Based on reference site showing:

- Line 205 → Destination "Campanhã"
- Vehicle number 1130
- Real-time speed

The FIWARE API should provide:

- Line number in entity ID or route field
- Destination in `destination` or `routeLongName`
- Vehicle ID in `vehiclePlateIdentifier` or similar
- Speed in `speed.value`

## Debug

Check your server console for:

```
Sample FIWARE entity: {
  "id": "urn:ngsi-ld:Vehicle:205:1130",
  "location": { ... },
  "speed": { "value": 18 },
  "destination": { "value": "Campanhã" },
  ...
}
```

This shows exactly what fields are available and their names.

## If Data Missing

If destination or vehicle number don't show:

1. Check console log for FIWARE entity structure
2. Identify correct field names
3. Update field extraction in `pages/api/buses.tsx`
4. Restart dev server
