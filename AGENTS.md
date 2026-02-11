# Agent Guide: Porto Explore

## Project Overview

Porto Explore is a Next.js 16 web application providing real-time public transit information for Porto, Portugal. It shows live bus positions on an interactive map and station departure times via the Porto OpenTripPlanner GraphQL API.

## Architecture

### Framework & Routing
- **Next.js 16** with App Router (pages) + Pages Router (API routes)
- **TypeScript** for type safety
- **pnpm** as package manager
- Client-side rendering for interactive features (`"use client"`)
- Deployed on **Vercel**

### Pages Structure
- `/` — Live bus map (homepage) with route filtering, onboarding flow
- `/stations` — Station list with search, favorites, and geolocation
- `/station?gtfsId={id}` — Individual station page with live departures

### API Routes (Pages Router)
Located in `/pages/api/`:
- `buses.tsx` — Fetches real-time bus positions from FIWARE Urban Platform, enriches with OTP route data
- `stations.tsx` — Fetches all transit stops from OTP GraphQL API
- `station.tsx` — Fetches real-time departures for a specific station by `gtfsId`
- `route-shapes.tsx` — Fetches route pattern geometries from OTP, decodes polylines

## Key Technologies

- **React 18** with hooks for state management
- **SWR** for data fetching with auto-revalidation and localStorage caching
- **Leaflet + react-leaflet** for interactive maps
- **Tailwind CSS** for styling
- **PWA** with service worker for offline support

### Data Fetching
- Bus positions refresh every 30 seconds via SWR
- Station departures refresh every 30 seconds
- Stations list cached for 7 days in localStorage
- Shared fetchers in `lib/fetchers.ts` with localStorage fallback for instant loads

## Data Models

Shared types are defined in `lib/types.ts`:

### Bus
```typescript
interface Bus {
  id: string; lat: number; lon: number;
  routeShortName: string; routeLongName: string;
  heading: number; speed: number;
  lastUpdated: string; vehicleNumber: string;
}
```

### Stop
```typescript
interface Stop {
  id: string; code: string; desc: string;
  lat: number; lon: number; name: string;
  gtfsId: string; // e.g., "2:BRRS2"
}
```

### StoptimesWithoutPatterns
```typescript
interface StoptimesWithoutPatterns {
  realtimeState: string; // "UPDATED" | "SCHEDULED"
  realtimeDeparture: number; // seconds since midnight
  scheduledDeparture: number;
  serviceDay: number; // unix timestamp for midnight of service day
  realtime: boolean;
  departureDelay: number;
  trip: {
    route: { shortName: string; longName: string; mode: string; color: string; };
  };
}
```

**Time calculation**: Actual departure time = `(serviceDay + realtimeDeparture) * 1000` (milliseconds).

## External APIs

### Porto OpenTripPlanner
- **URL**: `https://otp.services.porto.digital/otp/routers/default/index/graphql`
- **Protocol**: GraphQL over HTTP POST
- **Auth**: None (requires `Origin: https://explore.porto.pt` header)
- **Known issue**: GTFS schedule data expired Dec 31, 2025. Stops/routes exist but departures return empty arrays. The app handles this gracefully with a user-facing message.

### FIWARE Urban Platform (Bus Positions)
- **URL**: `https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000`
- **Protocol**: REST (NGSI v2)
- **Auth**: None
- Returns real-time GPS positions for STCP buses

## File Structure

```
porto-realtime/
├── app/
│   ├── page.tsx              # Bus map page (homepage)
│   ├── layout.tsx            # Root layout with PWA support
│   ├── globals.css           # Global styles + Leaflet popup styles
│   ├── stations/
│   │   └── page.tsx          # Station list page
│   └── station/
│       └── page.tsx          # Station detail page
├── components/
│   ├── LeafletMap.tsx        # Map component with bus/stop markers
│   ├── RouteFilterPanel.tsx  # Route selection panel
│   ├── AboutModal.tsx        # About dialog
│   ├── OnboardingFlow.tsx    # 3-step onboarding (welcome → routes → location)
│   ├── DarkModeToggle.tsx    # Dark mode toggle button
│   ├── LoadingSkeletons.tsx  # Skeleton loading states
│   └── PWAInstallPrompt.tsx  # PWA install + update prompts
├── lib/
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── fetchers.ts           # Shared SWR fetchers with localStorage cache
│   ├── translations.ts       # Portuguese i18n strings
│   ├── storage.ts            # localStorage wrapper with expiry
│   └── logger.ts             # Environment-aware logging
├── pages/
│   └── api/
│       ├── buses.tsx         # Bus positions API (FIWARE + OTP enrichment)
│       ├── stations.tsx      # All stops API
│       ├── station.tsx       # Station departures API
│       └── route-shapes.tsx  # Route geometries API
├── public/                   # Static assets, PWA manifest, service worker
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.mjs
```

## Key Features

### Bus Map (`/`)
- Real-time bus markers with route number + destination labels
- Route filtering with favorites (persisted in localStorage)
- Route path visualization (polylines from OTP pattern geometries)
- Stop markers (viewport-based rendering for performance)
- User geolocation with fly-to animation
- Station highlighting via URL param (`/?station=2:BRRS2`)
- 3-step onboarding for first-time users
- Dark mode support

### Station Departures (`/station`)
- Live departure times using `serviceDay + departureSeconds` for correct timezone handling
- Color-coded urgency (red ≤2min, orange ≤5min, blue ≤10min, time >10min)
- Real-time vs scheduled indicator
- Graceful handling when GTFS data is unavailable (links to live map)

### Stations List (`/stations`)
- 5 closest stations via Haversine distance
- Favorites with localStorage persistence
- Text search filter

## Development Guidelines

### Adding Features
1. **New API endpoints**: Add to `/pages/api/`
2. **New pages**: Add to `/app/` directory
3. **Shared types**: Add to `lib/types.ts`
4. **Data fetching**: Use SWR with fetchers from `lib/fetchers.ts`
5. **Components**: Extract to `components/` directory

### Known Issues
- GTFS schedule data on OTP server expired Dec 31, 2025 — station departures return empty
- Bus positions (FIWARE) continue to work independently

## Environment
- No environment variables required
- All APIs are publicly accessible
- No authentication needed
