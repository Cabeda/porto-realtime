# Porto Explore

Real-time public transit tracker for Porto, Portugal. View live departure times, save favorite stations, and find nearby stops.

## Features

- **Real-time Departures**: Live updates from Porto's public transit system
- **Geolocation**: Automatically finds the 5 closest stations
- **Favorites**: Save frequently used stations to local storage
- **Station Search**: Filter and browse all available stations
- **Auto-refresh**: Station pages update every 30 seconds

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **SWR** - Data fetching with auto-revalidation
- **GraphQL** - Porto OTP API integration

## API Routes

- `/api/stations` - Fetches all transit stops
- `/api/station?gtfsId={id}` - Fetches real-time departures for a specific station

## Data Source

Transit data from Porto's OpenTripPlanner instance: `https://otp.services.porto.digital`
