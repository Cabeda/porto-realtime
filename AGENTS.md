# Agent Guide: Porto Explore

## Project Overview

Porto Explore is a Next.js 14 web application that provides real-time public transit information for Porto, Portugal. It uses the Porto OpenTripPlanner GraphQL API to fetch live departure times and station data.

## Architecture

### Framework & Routing
- **Next.js 14** with App Router
- **TypeScript** for type safety
- Client-side rendering for interactive features (`"use client"`)

### Pages Structure
- `/` - Home page with station list, favorites, and geolocation
- `/station?gtfsId={id}` - Individual station page with live departures

### API Routes (Pages Router)
Located in `/pages/api/`:
- `stations.tsx` - Fetches all transit stops from OTP API
- `station.tsx` - Fetches real-time departures for a specific station by `gtfsId`

## Key Technologies

### Data Fetching
- **SWR** for client-side data fetching with automatic revalidation
- Station page auto-refreshes every 30 seconds (`refreshInterval: 30000`)
- Stations list cached for 1 week (`revalidate: 604800`)

### State Management
- React hooks (`useState`, `useEffect`)
- Local storage for favorites persistence
- Browser Geolocation API for finding nearby stations

### Styling
- **Tailwind CSS** for utility-first styling
- Responsive design with mobile-first approach
- Custom SVG icons for favorites and live indicators

## Data Models

### Station/Stop
```typescript
interface Stop {
  id: string;
  code: string;
  desc: string;
  lat: number;
  lon: number;
  name: string;
  gtfsId: string; // Primary identifier (e.g., "2:BRRS2")
}
```

### Departure/Stoptime
```typescript
interface StoptimesWithoutPatterns {
  realtimeState: string; // "UPDATED" | "SCHEDULED"
  realtimeDeparture: number; // Unix timestamp (seconds)
  scheduledDeparture: number;
  realtimeArrival: number;
  scheduledArrival: number;
  arrivalDelay: number;
  departureDelay: number;
  realtime: boolean;
  serviceDay: number;
  trip: {
    route: {
      gtfsId: string;
      shortName: string; // Route number
      longName: string; // Destination
      mode: string;
      color: string;
    };
  };
}
```

## External API

### Porto OpenTripPlanner
- **Base URL**: `https://otp.services.porto.digital/otp/routers/default/index/graphql`
- **Protocol**: GraphQL over HTTP POST
- **Authentication**: None required
- **Headers**: Standard CORS headers with Origin set to `https://explore.porto.pt`

### GraphQL Queries

**Get All Stations:**
```graphql
query Request {
  stops {
    id code desc lat lon name gtfsId
  }
}
```

**Get Station Departures:**
```graphql
query StopRoutes($id_0: String!, $startTime_1: Long!, $timeRange_2: Int!, $numberOfDepartures_3: Int!) {
  stop(id: $id_0) {
    id name
    stoptimesWithoutPatterns(startTime: $startTime_1, timeRange: $timeRange_2, numberOfDepartures: $numberOfDepartures_3, omitCanceled: false) {
      realtimeState realtimeDeparture scheduledDeparture
      trip { route { shortName longName mode color } }
    }
  }
}
```

## Key Features Implementation

### Geolocation
- Uses browser's `navigator.geolocation.getCurrentPosition()`
- Calculates distance using Euclidean distance formula
- Displays 5 closest stations sorted by distance

### Favorites
- Stored in `localStorage` as JSON array
- Persisted across sessions
- Add/remove functionality with star button

### Live Updates
- Station page uses SWR with 30-second refresh interval
- Displays "Already left" for departures in the past
- Shows minutes until departure for upcoming trips (<10 min)
- Shows actual time for departures >10 minutes away
- Pulsing animation for departures <5 minutes with realtime data

## File Structure

```
porto-realtime/
├── app/
│   ├── page.tsx              # Home page (station list)
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles
│   ├── station/
│   │   └── page.tsx          # Station detail page
│   └── *.svg                 # Icon assets
├── pages/
│   └── api/
│       ├── stations.tsx      # All stations API
│       └── station.tsx       # Single station API
├── public/                   # Static assets (favicons)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.mjs
```

## Development Guidelines

### When Adding Features
1. **New API endpoints**: Add to `/pages/api/` using Next.js API routes
2. **New pages**: Add to `/app/` directory using App Router conventions
3. **State management**: Use React hooks and localStorage for persistence
4. **Data fetching**: Use SWR for client-side fetching with appropriate cache/refresh intervals

### Common Tasks

**Add a new station field:**
1. Update GraphQL query in `/pages/api/stations.tsx`
2. Update `Stop` interface
3. Display in `/app/page.tsx` or `/app/station/page.tsx`

**Modify refresh interval:**
- Station page: Change `refreshInterval` in SWR config
- Stations list: Change `revalidate` in fetch options

**Add new filter/sort:**
- Implement in `/app/page.tsx` using array methods
- Consider adding to localStorage for persistence

### Known Issues
- Duplicate `e.preventDefault()` calls in favorite button handlers
- Unused `router` import in station page
- Timezone offset calculation may not work correctly for all timezones

## Testing Considerations
- Test geolocation with browser permission denied
- Test localStorage in private/incognito mode
- Test with slow network (30s refresh interval)
- Verify GTFS ID format compatibility with OTP API
- Test mobile responsive layout

## Environment
- No environment variables required
- API is publicly accessible
- No authentication needed
