# Live Bus Map Implementation Summary

## Changes Made

### New Files Created

1. **`pages/api/buses.tsx`** - API route that proxies the FIWARE Urban Platform API
   - Fetches real-time bus location data from Porto's FIWARE broker
   - Normalizes the NGSI v2 entity format into a clean TypeScript interface
   - Returns buses with: id, lat/lon, route info, heading, speed, and last update time

2. **`app/map/page.tsx`** - New page displaying live bus map
   - Uses Leaflet via react-leaflet for mapping
   - Shows all buses on an interactive map centered on Porto
   - Auto-refreshes every 30 seconds using SWR
   - Markers show route number, destination, direction, speed, and last update
   - Dynamic imports to avoid SSR issues with Leaflet

### Modified Files

3. **`package.json`** - Added dependencies:
   - `leaflet` (^1.9.4) - Mapping library
   - `react-leaflet` (^4.2.1) - React wrapper for Leaflet
   - `@types/leaflet` (^1.9.8) - TypeScript types

4. **`app/page.tsx`** - Added navigation
   - "Live Bus Map" button in the header linking to `/map`
   - Styled as prominent blue button with map emoji

## Installation

Run the following command to install the new dependencies:

```bash
npm install
```

This will install:

- leaflet
- react-leaflet
- @types/leaflet

## Testing

1. **Start the development server:**

   ```bash
   npm run dev
   ```

2. **Test the home page:**
   - Visit http://localhost:3000
   - You should see a new "Live Bus Map" button in the header

3. **Test the map page:**
   - Click the "Live Bus Map" button or visit http://localhost:3000/map
   - The map should load showing Porto
   - Bus markers should appear on the map (may take a few seconds)
   - Click on any bus marker to see a popup with route details

4. **Test the API endpoint:**
   - Visit http://localhost:3000/api/buses
   - You should see JSON data with a `buses` array
   - Each bus should have: id, lat, lon, routeShortName, routeLongName, heading, speed, lastUpdated

## Features

### Live Bus Map (`/map`)

- **Interactive Map**: Pan, zoom, and explore Porto
- **Real-time Updates**: Refreshes every 30 seconds
- **Bus Markers**: Each bus shows as a marker on the map
- **Route Information**: Click any bus to see:
  - Route number (e.g., "502")
  - Destination/route name
  - Direction in degrees
  - Current speed
  - Last update timestamp
- **Navigation**: "Back to Stations" link to return home

### API Endpoint (`/api/buses`)

- **CORS-safe**: Server-side proxy avoids browser CORS issues
- **Normalized Data**: Converts FIWARE NGSI v2 format to clean JSON
- **Defensive Parsing**: Handles various field name variations in the FIWARE response
- **Error Handling**: Returns proper error responses if the FIWARE API is unavailable

## Architecture Decisions

1. **Server-side API Proxy**: The `/api/buses` endpoint acts as a proxy to avoid CORS issues and normalize the data format
2. **Dynamic Imports**: react-leaflet components are dynamically imported with `ssr: false` because Leaflet requires `window`
3. **SWR with 30s Refresh**: Matches the existing pattern in the station page for consistency
4. **Defensive Field Parsing**: The API proxy checks multiple possible field names (e.g., `routeShortName`, `route`, `lineId`) to handle variations in the FIWARE data

## Known Considerations

1. **FIWARE Field Names**: The exact field names in the FIWARE API response may vary. The current implementation checks common variations, but if buses don't display correctly, check the raw API response at `/api/buses` and adjust field mappings in `pages/api/buses.tsx`.

2. **Map Markers**: Currently using default Leaflet markers. Consider customizing with:
   - Colored markers by route
   - Bus icons rotated by heading
   - Clustered markers for better performance with many buses

3. **Performance**: With 1000+ buses, the map may slow down. Consider:
   - Adding marker clustering (react-leaflet-markercluster)
   - Filtering to show only buses in the visible map area
   - Reducing refresh interval to 60 seconds

## Future Enhancements

- [ ] Custom bus icon markers colored by route
- [ ] Rotate bus icons based on heading direction
- [ ] Filter buses by route number
- [ ] Show bus trajectories/paths
- [ ] Link to station pages when clicking buses
- [ ] Add marker clustering for better performance
- [ ] Add user location marker on the map
- [ ] Show nearest buses to user's location

## Troubleshooting

### Map doesn't load

- Check browser console for errors
- Ensure Leaflet CSS is loading (check Network tab)
- Try refreshing the page

### No buses showing

- Check `/api/buses` endpoint returns data
- Verify FIWARE API is accessible
- Check browser console for errors

### TypeScript errors

- Run `npm install` to ensure all types are installed
- Restart your editor/IDE
- Run `npm run build` to check for build errors

## Data Source

Bus location data from Porto Digital's FIWARE Urban Platform:

- **Endpoint**: `https://broker.fiware.urbanplatform.portodigital.pt/v2/entities`
- **Query**: `?q=vehicleType==bus&limit=1000`
- **Format**: FIWARE NGSI v2 (normalized in our API proxy)
