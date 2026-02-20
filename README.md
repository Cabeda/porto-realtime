# PortoMove

**Giving a voice to those using public transportation and micro-mobility in Porto.**

PortoMove is an open-source web app that provides real-time public transit information for Porto, Portugal. Track live bus positions, check departure times, review transit lines and stops, and explore bike infrastructure — all in one place.

Your feedback helps improve mobility for everyone.

## Features

- **Live Bus Map** — Real-time bus positions on an interactive map, updated every 30 seconds
- **Station Departures** — Live departure times with real-time vs scheduled indicators
- **Route Visualization** — Bus and metro route paths with filtering and favorites
- **Community Reviews** — Rate and review lines, stops, vehicles, bike parks, and bike lanes
- **Activity Check-ins** — Share what you're doing (biking, walking, scooting) on the map
- **Bike Infrastructure** — Bike parks and bike lanes from Porto open data
- **Geolocation** — Find the 5 closest stations automatically
- **Favorites** — Save frequently used stations and routes
- **Dark Mode** — Full dark mode support
- **PWA** — Install as an app with offline support and static fallback data
- **Resilient** — API retry logic, stale data fallback, and degraded-state UI

## Getting Started

This project uses **pnpm** as the package manager.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Tech Stack

- **Next.js 16** with App Router
- **TypeScript** + **React 18**
- **Tailwind CSS** for styling
- **Leaflet** for interactive maps
- **SWR** for data fetching with auto-revalidation
- **Prisma 7** + **Neon PostgreSQL** for database
- **Neon Auth** (Better Auth) for authentication
- **Zod 4** for API validation
- **Vitest** + **Playwright** for testing
- **pnpm** as package manager

## Data Sources

All transit data originates from **STCP (Sociedade de Transportes Colectivos do Porto)**, officially published on the [Porto Open Data portal](https://opendata.porto.digital/organization/sociedade-de-transportes-colectivos-do-porto-stcp).

- **Transit Data**: [Porto OpenTripPlanner](https://otp.portodigital.pt) (GraphQL) — schedules, stops, routes, and real-time departures from STCP GTFS feeds
- **Bus Positions**: [FIWARE Urban Platform](https://broker.fiware.urbanplatform.portodigital.pt) (NGSI v2) — real-time GPS positions from STCP's AVL system
- **Bike Infrastructure**: [Explore Porto](https://portal.api.portodigital.pt) open data
- **Map Tiles**: OpenStreetMap

## Contributing

We'd love your help making Porto's transit better. Here's how:

1. **Rate transit** — Use the app to review lines, stops, and vehicles at [portomove.pt/reviews](https://portomove.pt/reviews)
2. **Report bugs** — [Open an issue](https://github.com/Cabeda/porto-realtime/issues) with what went wrong
3. **Suggest features** — [Open an issue](https://github.com/Cabeda/porto-realtime/issues) describing what you'd like to see
4. **Contribute code** — Fork, create a feature branch, and open a PR

## License

This project is open source and available under the MIT License.
