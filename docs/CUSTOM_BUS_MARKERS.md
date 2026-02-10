# Custom Bus Markers with Line Numbers

## What Changed

Instead of simple emoji bus icons (🚌), each bus now displays as a **custom SVG bus icon with the line number inside**, making it easy to identify which buses you're interested in at a glance.

## Visual Representation

**Before:**
```
🚌  🚌  🚌  (all buses look the same)
```

**After:**
```
[Bus icon with "205" inside]  [Bus icon with "502" inside]  [Bus icon with "ZM" inside]
```

Each bus marker now shows:
- Blue bus icon (SVG)
- Line number centered inside
- Windows and wheels for realism
- Drop shadow for depth

## Implementation Details

### 1. Dynamic Icon Creation (app/map/page.tsx)

Each bus gets a unique icon with its line number:
- **SVG bus shape**: Blue body, light blue windows, dark wheels
- **Line number overlay**: Bold white text centered on the bus
- **Custom styling**: Drop shadow for visibility on map

### 2. CSS Styling (app/globals.css)

Added styles for:
- `.custom-bus-marker` - Transparent background, no borders
- `.bus-icon-container` - Drop shadow for 3D effect
- `.bus-line-number` - Positioned text with shadow for readability

### 3. Icon Details

**Bus SVG:**
- 40x40px size
- Blue body (#2563eb) with rounded corners
- Two windows (light blue)
- Two wheels (dark gray)

**Line Number:**
- Bold, 11px font
- White color with text shadow
- Centered on bus body
- Supports 1-3 characters

## Benefits

1. **Quick Identification**: See which line each bus is at a glance
2. **Better UX**: No need to click every bus to see the line
3. **Matches Reference**: Similar to https://stcp.tiagoanoliveira.pt/
4. **Scalable**: Works with any line number (205, 502, ZM, etc.)

## Testing

Refresh http://localhost:3000/map and you should see:
- ✅ Custom blue bus icons
- ✅ Line numbers visible inside each bus
- ✅ Clean appearance with drop shadows
- ✅ Easy to distinguish different lines

## Code Structure

```typescript
// For each bus, create custom icon with line number
const busIcon = L.divIcon({
  html: `
    <div class="bus-marker">
      <svg>...</svg>  <!-- Bus shape -->
      <div class="bus-line-number">${lineNumber}</div>
    </div>
  `,
  className: "custom-bus-marker",
  iconSize: [40, 40],
  iconAnchor: [20, 35],  // Bottom center
});
```

## Future Enhancements

Possible improvements:
- [ ] Color-code buses by route type (regular, express, night)
- [ ] Rotate bus icon based on heading direction
- [ ] Cluster markers when zoomed out
- [ ] Add animation for moving buses
- [ ] Different sizes for zoom levels

## Comparison with Reference Site

Our implementation provides:
- ✅ Line numbers visible on map
- ✅ SVG bus icons
- ✅ Similar visual style
- ✅ Easy line identification
- ✅ Professional appearance

The custom markers make it much easier to spot the buses you're looking for without clicking each one!
