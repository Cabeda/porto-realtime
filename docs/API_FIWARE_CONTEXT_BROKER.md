# FIWARE NGSI v2 Context Broker — Porto Urban Platform

## Overview

**Base URL:** `https://broker.fiware.urbanplatform.portodigital.pt/v2`  
**Protocol:** REST (NGSI v2)  
**Authentication:** None observed (public read access for vehicle entities)  
**Rate Limiting:** Unknown (no documented limits)

The FIWARE Orion Context Broker hosted by Porto Digital provides **real-time vehicle position data** for STCP buses operating in the Porto metropolitan area. It is the only source of live bus locations in our app.

---

## What is FIWARE Orion Context Broker?

The Orion Context Broker is the core component of the FIWARE open-source platform for smart city and IoT applications. It implements the NGSI v2 (and NGSI-LD) API specification for managing context information — real-time data about entities in the physical world.

- **License:** AGPL v3
- **Source Code:** [github.com/telefonicaid/fiware-orion](https://github.com/telefonicaid/fiware-orion)
- **Specification:** [NGSI v2 API](https://fiware.github.io/specifications/ngsiv2/stable/)
- **Maintained by:** Telefónica I+D (primary), with contributions from the FIWARE Foundation community

### Who Hosts the Porto Instance?

**Porto Digital** — the city of Porto's innovation agency — operates this Context Broker as part of the **Porto Urban Platform (PUP)**. The platform is a central pillar of Porto's smart city strategy, built on FIWARE standards to ensure interoperability.

The Porto Urban Platform architecture includes:

| Layer | Description |
|---|---|
| **Data Acquisition (UrbanSense)** | 75+ fixed monitoring stations, 200+ municipal vehicles with mobile sensors. Developed with Ubiwhere. |
| **Interoperability (Context Broker)** | FIWARE Orion — centralizes real-time data from all city systems. |
| **Vertical Domains** | Mobility (buses, traffic), Environment (air quality, noise), Energy & Waste. |
| **Open Data** | Selected datasets exposed publicly for developers and researchers. |

The bus vehicle data comes from **STCP's AVL (Automatic Vehicle Location)** system, which feeds GPS positions into the Context Broker in near real-time.

---

## How We Use It

We make a single API call to fetch all bus positions:

| Use Case | API Proxy | Endpoint | Cache Duration |
|---|---|---|---|
| Real-time bus positions | `pages/api/buses.tsx` | `GET /v2/entities?q=vehicleType==bus&limit=1000` | 10 seconds |

This is the **only endpoint we call** on the FIWARE broker. The response is an array of Vehicle entities with GPS coordinates, which we parse and normalize into our internal `Bus` type.

---

## NGSI v2 API Reference (Relevant Subset)

### Entities Endpoint

```
GET /v2/entities
```

**Query Parameters:**

| Parameter | Type | Description | Example |
|---|---|---|---|
| `type` | string | Filter by entity type | `?type=Vehicle` |
| `q` | string | Simple Query Language filter | `?q=vehicleType==bus` |
| `id` | string | Filter by specific entity ID | `?id=urn:ngsi-ld:Vehicle:stcp:205:3264` |
| `idPattern` | string | Regex filter on entity ID | `?idPattern=stcp:205:.*` |
| `attrs` | string | Comma-separated attributes to return | `?attrs=location,speed` |
| `limit` | integer | Max results per page (default 20, max 1000) | `?limit=1000` |
| `offset` | integer | Pagination offset | `?offset=0` |
| `orderBy` | string | Sort field | `?orderBy=dateModified` |
| `options` | string | Response format options | `?options=keyValues` (simplified format) |
| `georel` | string | Geo-spatial relationship | `?georel=near;maxDistance:1000` |
| `geometry` | string | Geo-spatial shape type | `?geometry=point` |
| `coords` | string | Geo-spatial coordinates | `?coords=41.15,-8.61` |

### NGSI v2 Attribute Format

Each attribute in a standard NGSI v2 response is an object with `value`, `type`, and optional `metadata`:

```json
{
  "speed": {
    "value": 35.2,
    "type": "Number",
    "metadata": {
      "timestamp": {
        "value": "2025-01-15T10:30:00Z",
        "type": "DateTime"
      }
    }
  }
}
```

With `?options=keyValues`, attributes are flattened to just their values:

```json
{
  "speed": 35.2
}
```

Our app uses the **standard format** (not keyValues), so we access values as `entity.speed.value`.

---

## Vehicle Entity Schema

Each bus entity returned by the Porto Context Broker follows the [FIWARE Smart Data Models — Vehicle](https://github.com/smart-data-models/dataModel.Transportation/tree/master/Vehicle) specification, with STCP-specific extensions.

### Entity Structure

```json
{
  "id": "urn:ngsi-ld:Vehicle:stcp:205:3264",
  "type": "Vehicle",
  "location": {
    "type": "geo:json",
    "value": {
      "type": "Point",
      "coordinates": [-8.6291, 41.1579]
    }
  },
  "vehicleType": {
    "value": "bus",
    "type": "Text"
  },
  "vehiclePlateIdentifier": {
    "value": "STCP 205 3264",
    "type": "Text"
  },
  "speed": {
    "value": 28.5,
    "type": "Number"
  },
  "heading": {
    "value": 180,
    "type": "Number"
  },
  "dateModified": {
    "value": "2025-01-15T10:30:00.000Z",
    "type": "DateTime"
  },
  "annotations": {
    "value": [
      "stcp:route:205",
      "stcp:sentido:1",
      "stcp:nr_viagem:T205_1_42"
    ],
    "type": "StructuredValue"
  }
}
```

### Attribute Reference

| Attribute | Type | Description | Example Value |
|---|---|---|---|
| `id` | string | URN identifier. Format: `urn:ngsi-ld:Vehicle:stcp:ROUTE:VEHICLE_ID` | `"urn:ngsi-ld:Vehicle:stcp:205:3264"` |
| `type` | string | Always `"Vehicle"` | `"Vehicle"` |
| `location` | geo:json | GPS position as GeoJSON Point. **Coordinates are [lon, lat]** (GeoJSON standard). | `{"type":"Point","coordinates":[-8.629,41.158]}` |
| `vehicleType` | Text | Vehicle category | `"bus"` |
| `vehiclePlateIdentifier` | Text | Vehicle identifier string. Format varies: `"STCP ROUTE VEHICLE_NUM"` | `"STCP 205 3264"` |
| `vehicleNumber` | Text | Alternative vehicle number field (not always present) | `"3264"` |
| `speed` | Number | Current speed (km/h, assumed) | `28.5` |
| `heading` | Number | Compass bearing in degrees (0-360) | `180` |
| `bearing` | Number | Alternative heading field (not always present) | `270` |
| `dateModified` | DateTime | Last update timestamp (ISO 8601) | `"2025-01-15T10:30:00.000Z"` |
| `timestamp` | DateTime | Alternative timestamp field | `"2025-01-15T10:30:00.000Z"` |
| `annotations` | StructuredValue | Array of STCP-specific metadata strings | `["stcp:route:205","stcp:sentido:1"]` |
| `routeShortName` | Text | Route number (not always present) | `"205"` |
| `route` | Text | Alternative route field | `"205"` |
| `lineId` | Text | Alternative line identifier | `"205"` |
| `line` | Text | Alternative line field | `"205"` |
| `routeLongName` | Text | Route destination (not always present) | `"Castelo do Queijo"` |
| `destination` | Text | Alternative destination field | `"Campanhã"` |
| `tripHeadsign` | Text | Trip headsign | `"Castelo do Queijo"` |
| `name` | Text | Entity display name | `"STCP 205 3264"` |

### STCP Annotations Format

The `annotations` array contains STCP-specific metadata encoded as prefixed strings:

| Annotation Pattern | Description | Example |
|---|---|---|
| `stcp:route:XXX` | Route number | `"stcp:route:205"` |
| `stcp:sentido:N` | Direction ID (0 or 1) | `"stcp:sentido:1"` |
| `stcp:nr_viagem:XXX` | Trip identifier | `"stcp:nr_viagem:T205_1_42"` |

### Entity ID Format (URN)

Entity IDs follow the NGSI-LD URN convention:

```
urn:ngsi-ld:Vehicle:stcp:ROUTE:VEHICLE_ID
```

Example: `urn:ngsi-ld:Vehicle:stcp:205:3264`

| Segment | Meaning |
|---|---|
| `urn:ngsi-ld` | NGSI-LD namespace |
| `Vehicle` | Entity type |
| `stcp` | Data provider (STCP) |
| `205` | Route short name |
| `3264` | Vehicle number |

---

## Data Extraction Logic

Because the FIWARE entity schema is not strictly enforced (different vehicles may have different attributes populated), our `pages/api/buses.tsx` uses a **fallback chain** to extract each field:

### Route Number Extraction (priority order)
1. `entity.routeShortName.value`
2. `entity.route.value`
3. `entity.lineId.value`
4. `entity.line.value`
5. Parse from `vehiclePlateIdentifier` (regex: `STCP\s+(\d+)`)
6. Parse from entity `id` URN (second-to-last segment)

### Destination Extraction (priority order)
1. `entity.routeLongName.value`
2. `entity.destination.value`
3. `entity.tripHeadsign.value`
4. `entity.headsign.value`
5. `entity.direction.value`
6. Fallback to OTP route data (cached headsigns by route + direction)

### Vehicle Number Extraction (priority order)
1. `entity.vehiclePlateIdentifier.value`
2. `entity.vehicleNumber.value`
3. `entity.license_plate.value`
4. `entity.name.value`
5. Last segment of entity `id`

---

## Resilience & Caching Strategy

The FIWARE broker can be unreliable (timeouts, 5xx errors), so our proxy implements:

| Strategy | Implementation |
|---|---|
| **Retry with backoff** | Up to 3 retries with exponential backoff (1s, 2s, 4s). 10s timeout per attempt. |
| **Stale data fallback** | If the broker is down, return last successful response (up to 5 minutes old). |
| **CDN caching** | `Cache-Control: public, s-maxage=10, stale-while-revalidate=60` |
| **OTP destination cache** | Route destinations from OTP are cached 24 hours in-memory, used to enrich FIWARE data. |

---

## Limitations & Considerations

- **Inconsistent schema** — Not all vehicles have the same attributes populated. The fallback chain in our parser handles this, but new attribute patterns may appear without notice.
- **No authentication** — Public read access could be restricted at any time by Porto Digital.
- **GeoJSON coordinate order** — Location coordinates are `[longitude, latitude]` (GeoJSON standard), which is the **opposite** of the `[lat, lon]` convention used by Leaflet and most mapping libraries. We swap them in the parser.
- **Update frequency** — Vehicle positions update roughly every 10-30 seconds, but some vehicles may go silent for minutes.
- **No historical data** — The Context Broker only stores the current state. There is no way to query past positions.
- **Entity count** — Typically 100-400 active bus entities depending on time of day and service level.
- **No GTFS-RT** — The FIWARE broker is not a GTFS-RT feed. It uses its own NGSI v2 data model. The OTP instance may have separate GTFS-RT integration for schedule predictions.
- **STCP only** — Only STCP buses appear in the broker. Other operators (Metro do Porto, CP trains) are not included.
- **Annotations are STCP-specific** — The `stcp:sentido:` and `stcp:nr_viagem:` annotation patterns are custom to STCP's AVL system, not part of the FIWARE standard.
