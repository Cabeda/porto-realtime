# Porto Bus - Mapa em Tempo Real

Real-time public transit tracker for Porto, Portugal. View live bus positions on an interactive map, check departure times, and save favorite stations.

## Features

- **🗺️ Live Bus Map**: Interactive map showing real-time bus positions across Porto
- **🚌 Real-time Tracking**: Bus locations update every 10 seconds
- **📍 Geolocation**: Automatically finds the 5 closest stations
- **⭐ Favorites**: Save frequently used stations with persistent storage
- **🔍 Station Search**: Filter and browse all available stations
- **⏱️ Auto-refresh**: Station pages update every 30 seconds
- **📱 PWA Support**: Install as an app, works offline with intelligent caching
- **🚀 Reliable**: API retry logic and stale data fallback for graceful degradation

## Prerequisites

This project uses **pnpm** as the package manager. Install it if you haven't already:

```bash
npm install -g pnpm
```

Or use the standalone script:

```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

## Getting Started

Install dependencies:

```bash
pnpm install
```

Run the development server:

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
```

Start production server:

```bash
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Tech Stack

- **Next.js 16** - React framework with App Router and Turbopack
- **React 18.3.1** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **Leaflet** - Interactive maps
- **SWR** - Data fetching with auto-revalidation
- **GraphQL** - Porto OTP API integration
- **PWA** - Progressive Web App with service worker
- **pnpm** - Fast, disk space efficient package manager

## Pages

- `/` - Live bus map (homepage)
- `/stations` - Station list with search and favorites
- `/station?gtfsId={id}` - Real-time departures for a specific station

## API Routes

- `/api/buses` - Fetches real-time bus positions from FIWARE Urban Platform
- `/api/stations` - Fetches all transit stops (30-day cache)
- `/api/station?gtfsId={id}` - Fetches real-time departures for a specific station (30s refresh)

## Data Sources

- **Transit Data**: Porto's OpenTripPlanner instance at `https://otp.services.porto.digital`
- **Real-time Bus Positions**: FIWARE Urban Platform at `https://opendata.porto.digital`
- **Map Tiles**: OpenStreetMap

## Development

This project enforces pnpm usage via the `preinstall` script. If you try to use npm or yarn, you'll get an error.

To bypass this (not recommended):

```bash
# Temporarily disable preinstall check
pnpm install --ignore-scripts
```

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is open source and available under the MIT License.
