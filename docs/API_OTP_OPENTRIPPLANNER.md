# OpenTripPlanner (OTP) GraphQL API

## Overview

**Base URL:** `https://otp.portodigital.pt/otp/routers/default/index/graphql`  
**Protocol:** GraphQL (POST requests with JSON body)  
**Authentication:** None (public), but requires `Origin: https://explore.porto.pt` header  
**Rate Limiting:** Unknown (no documented limits, but we cache aggressively)

The OpenTripPlanner (OTP) instance hosted by Porto Digital provides static transit data (schedules, routes, stops, geometries) for the Porto metropolitan area. It serves as the authoritative source for GTFS-based transit information.

---

## What is OpenTripPlanner?

OpenTripPlanner is an open-source multimodal trip planning engine. It ingests GTFS (General Transit Feed Specification) data and OpenStreetMap data to provide transit routing, stop/route information, and schedule queries.

- **License:** LGPL v3
- **Source Code:** [github.com/opentripplanner/OpenTripPlanner](https://github.com/opentripplanner/OpenTripPlanner)
- **Current Version:** OTP 2.x (the Porto instance version is unconfirmed but uses the GTFS GraphQL API)
- **Governance:** Project Leadership Committee (PLC) under the Software Freedom Conservancy (SFC)

### Who Maintains It?

| Entity | Role |
|---|---|
| **TriMet** (Portland, Oregon) | Founding agency (2009). Continuous contributor. |
| **OpenPlans** | Original non-profit coordinator (2009–2012). |
| **Conveyal** | Technical leads for OTP1; created the R5 engine that influenced OTP2. |
| **IBI Group / Arcadis** | Current commercial maintainers of the original developer team (since 2019). |
| **Entur** (Norway) | Primary driver and funder of OTP2 architecture. PLC member Thomas Gran. |
| **HSL / Digitransit** (Finland) | Major contributor to OTP2. PLC member Joel Lappalainen. |
| **Software Freedom Conservancy** | Non-profit home handling legal and financial governance (since 2013). |

### Who Hosts the Porto Instance?

**Porto Digital** — the innovation agency for the city of Porto, Portugal — hosts and maintains the OTP instance at `otp.portodigital.pt`. It is part of Porto's Urban Platform smart city infrastructure. The GTFS data is sourced from STCP (Sociedade de Transportes Colectivos do Porto) and potentially other operators in the AMP (Área Metropolitana do Porto) region.

---

## How We Use It

We use the OTP GraphQL API for **static transit data only** (not trip planning/routing). Our app queries it for:

| Use Case | API Proxy | Query Type | Cache Duration |
|---|---|---|---|
| List all stops | `pages/api/stations.tsx` | `stops { id code desc lat lon name gtfsId }` | 30 days |
| Stop departures (real-time) | `pages/api/station.tsx` | `stop(id) { stoptimesWithoutPatterns { ... } }` | None (real-time) |
| Route info + stops + geometry | `app/api/line/route.ts` | `routes(name) { patterns { stops, patternGeometry } }` | 1 hour |
| All route shapes | `pages/api/route-shapes.tsx` | `routes { patterns { patternGeometry } }` | 24 hours |
| Route destinations (for bus labels) | `pages/api/buses.tsx` | `routes { shortName longName patterns { headsign directionId } }` | 24 hours |
| Simulated bus polylines | `lib/simulate.ts` | `routes(name) { patterns { patternGeometry } }` | In-memory |

---

## GraphQL Schema (Subset We Use)

### Core Types

```graphql
type Query {
  # Get a single stop by GTFS ID
  stop(id: String!): Stop

  # Get all stops
  stops: [Stop]

  # Search routes by name (fuzzy match)
  routes(name: String): [Route]
}

type Stop {
  id: ID!
  gtfsId: String!          # e.g. "2:BRRS2" (feedId:stopId)
  name: String!            # e.g. "Boavista - Casa da Música"
  code: String             # Short code displayed at physical stop
  desc: String             # Description
  lat: Float!
  lon: Float!
  routes: [Route]          # Routes serving this stop
  parentStation: Stop      # Parent station (if grouped)
  stoptimesWithoutPatterns(
    startTime: Long!       # Unix timestamp (seconds)
    timeRange: Int!        # Seconds to look ahead
    numberOfDepartures: Int!
    omitCanceled: Boolean
  ): [Stoptime]
}

type Route {
  gtfsId: String!          # e.g. "2:205"
  shortName: String!       # e.g. "205"
  longName: String         # e.g. "Campanhã - Castelo do Queijo"
  mode: String             # e.g. "BUS"
  color: String            # Hex color for the route
  agency: Agency
  patterns: [Pattern]
  alerts: [Alert]
}

type Pattern {
  id: ID!
  code: String
  name: String
  headsign: String         # e.g. "Castelo do Queijo"
  directionId: Int         # 0 or 1
  stops: [Stop]            # Ordered list of stops in this pattern
  trips: [Trip]
  patternGeometry: Geometry
}

type Geometry {
  length: Int              # Number of points
  points: String           # Google Encoded Polyline string
}

type Stoptime {
  realtimeState: String    # "SCHEDULED", "UPDATED", "CANCELED"
  realtimeDeparture: Int   # Seconds since midnight (real-time adjusted)
  scheduledDeparture: Int  # Seconds since midnight (scheduled)
  realtimeArrival: Int
  scheduledArrival: Int
  arrivalDelay: Int        # Seconds of delay (positive = late)
  departureDelay: Int
  realtime: Boolean        # Whether real-time data is available
  serviceDay: Long         # Unix timestamp of the service day start
  headsign: String
  trip: Trip
}

type Trip {
  gtfsId: String!
  pattern: Pattern
  route: Route
}

type Agency {
  gtfsId: String!
  name: String!
}
```

### Key Relationships

```
Agency ──1:N──> Route ──1:N──> Pattern ──1:N──> Stop
                                  │
                                  └──1:N──> Trip ──1:N──> Stoptime
```

- A **Route** (e.g. "205") has multiple **Patterns** (one per direction/variant)
- A **Pattern** defines an ordered sequence of **Stops** and a **patternGeometry** (encoded polyline)
- A **Stop** has **stoptimesWithoutPatterns** for real-time departure queries
- **Stoptimes** include both scheduled and real-time data, with delay information

### Encoded Polylines

The `patternGeometry.points` field returns a [Google Encoded Polyline](https://developers.google.com/maps/documentation/utilities/polylinealgorithm) string. We decode it using the `@mapbox/polyline` library. The decoded output is `[lat, lon][]` pairs which we convert to `[lon, lat][]` for GeoJSON/Leaflet compatibility.

---

## Example Queries

### Get all stops
```graphql
query {
  stops {
    id
    code
    desc
    lat
    lon
    name
    gtfsId
  }
}
```

### Get departures for a stop
```graphql
query StopDepartures($id: String!, $startTime: Long!, $timeRange: Int!, $numberOfDepartures: Int!) {
  stop(id: $id) {
    id
    name
    stoptimesWithoutPatterns(
      startTime: $startTime
      timeRange: $timeRange
      numberOfDepartures: $numberOfDepartures
      omitCanceled: false
    ) {
      realtimeState
      realtimeDeparture
      scheduledDeparture
      departureDelay
      realtime
      serviceDay
      headsign
      trip {
        gtfsId
        route { shortName longName mode color }
      }
    }
  }
}
```

Variables:
```json
{
  "id": "2:BRRS2",
  "startTime": 1718000000,
  "timeRange": 1800,
  "numberOfDepartures": 100
}
```

### Get route info with patterns, stops, and geometry
```graphql
query RouteInfo($name: String!) {
  routes(name: $name) {
    gtfsId
    shortName
    longName
    patterns {
      id
      headsign
      directionId
      stops {
        gtfsId
        name
        lat
        lon
        code
      }
      patternGeometry {
        length
        points
      }
    }
  }
}
```

Variables:
```json
{ "name": "205" }
```

**Note:** The `routes(name:)` query is a fuzzy search. If you search for "20", you may get routes "200", "201", "205", etc. Always filter the results by exact `shortName` match on the client side.

---

## GTFS ID Format

All GTFS IDs in the Porto OTP instance follow the format `feedId:entityId`:

- **Stops:** `2:BRRS2`, `2:ABCDE` — feed ID `2` + stop code
- **Routes:** `2:205`, `2:502` — feed ID `2` + route number
- **Trips:** `2:T205_1_1` — feed ID `2` + trip identifier

The feed ID `2` corresponds to the STCP GTFS feed.

---

## Limitations & Considerations

- **No authentication** — the API is public but could be restricted at any time by Porto Digital
- **Fuzzy route search** — `routes(name:)` is not an exact match; always filter results client-side
- **Real-time data quality** — `realtimeState` may be `SCHEDULED` even during service hours if GTFS-RT feed is delayed
- **No versioning** — the API schema may change when Porto Digital upgrades their OTP instance
- **Single GTFS feed** — currently only STCP data (feed ID `2`); other operators (Metro, CP) may be added in the future
- **Polyline precision** — encoded polylines have ~5 decimal places of precision (~1.1m accuracy)
