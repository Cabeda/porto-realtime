/**
 * PortoMove Position Collector
 *
 * A lightweight worker that runs on Fly.io and collects real-time bus
 * positions from the FIWARE Urban Platform every 30 seconds, storing
 * them in Neon Postgres for analytics.
 *
 * This is the foundation for all transit analytics (see GitHub issue #65).
 */

import { neon } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("FATAL: DATABASE_URL environment variable is not set");
  process.exit(1);
}

const FIWARE_URL =
  "https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000";
const INTERVAL_MS = 30_000; // 30 seconds
const BATCH_SIZE = 100; // rows per INSERT statement

const sql = neon(DATABASE_URL);

// ---------------------------------------------------------------------------
// FIWARE entity parsing helpers
// (Extracted from lib/schemas/fiware.ts — kept standalone to avoid
//  importing the full Next.js app into the worker.)
// ---------------------------------------------------------------------------

interface FiwareEntity {
  id: string;
  type?: string;
  location?: FiwareLocation;
  routeShortName?: FiwareValue<string>;
  route?: FiwareValue<string>;
  lineId?: FiwareValue<string>;
  line?: FiwareValue<string>;
  vehiclePlateIdentifier?: FiwareValue<string>;
  vehicleNumber?: FiwareValue<string>;
  license_plate?: FiwareValue<string>;
  name?: FiwareValue<string>;
  heading?: FiwareValue<number>;
  bearing?: FiwareValue<number>;
  speed?: FiwareValue<number>;
  dateModified?: FiwareValue<string>;
  timestamp?: FiwareValue<string>;
  annotations?: FiwareValue<string[]>;
}

type FiwareValue<T> = T | { value: T } | undefined | null;

interface FiwareLocation {
  type?: string;
  value?: { type?: string; coordinates: [number, number] };
  coordinates?: [number, number];
}

/** Extract the actual value from a FIWARE field that may be wrapped in { value: T }. */
function unwrap<T>(val: FiwareValue<T>): T | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "object" && val !== null && "value" in val) {
    return (val as { value: T }).value;
  }
  return val as T;
}

/** Extract [lon, lat] coordinates from a FIWARE location field. */
function unwrapLocation(loc: FiwareLocation): [number, number] | null {
  try {
    if (loc.value?.coordinates) return loc.value.coordinates;
    if (loc.coordinates) return loc.coordinates;
  } catch {
    // malformed location
  }
  return null;
}

/** Extract annotations array from a FIWARE entity. */
function unwrapAnnotations(
  val: FiwareValue<string[]>
): string[] | undefined {
  if (!val) return undefined;
  if (Array.isArray(val)) return val;
  if (typeof val === "object" && val !== null && "value" in val) {
    const inner = (val as { value: string[] }).value;
    if (Array.isArray(inner)) return inner;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Position row type
// ---------------------------------------------------------------------------

interface PositionRow {
  vehicleId: string;
  vehicleNum: string | null;
  route: string | null;
  tripId: string | null;
  directionId: number | null;
  lat: number;
  lon: number;
  speed: number | null;
  heading: number | null;
}

// ---------------------------------------------------------------------------
// FIWARE → PositionRow parsing
// (Logic mirrors app/api/buses/route.ts but simplified — we don't need
//  route destinations or long names for analytics storage.)
// ---------------------------------------------------------------------------

function parseEntity(entity: FiwareEntity): PositionRow | null {
  const coords = unwrapLocation(entity.location!);
  if (!coords) return null;

  // Extract route short name (same priority chain as /api/buses)
  let route: string | null = null;
  const rsn = unwrap(entity.routeShortName);
  const rte = unwrap(entity.route);
  const lid = unwrap(entity.lineId);
  const lin = unwrap(entity.line);

  if (rsn) {
    route = rsn;
  } else if (rte) {
    route = rte;
  } else if (lid) {
    route = lid;
  } else if (lin) {
    route = lin;
  } else {
    // Try to extract from vehicle ID or entity ID
    const vehicleId =
      unwrap(entity.vehiclePlateIdentifier) ||
      unwrap(entity.vehicleNumber) ||
      unwrap(entity.license_plate) ||
      unwrap(entity.name) ||
      "";

    if (vehicleId) {
      const match = vehicleId.match(/STCP\s+(\d+)/i);
      if (match?.[1]) route = match[1];
    }

    if (!route && entity.id) {
      const parts = entity.id.split(":");
      for (let i = 2; i < parts.length - 1; i++) {
        const part = parts[i];
        if (
          part &&
          part !== "Vehicle" &&
          part !== "porto" &&
          part !== "stcp" &&
          /^[A-Z0-9]{1,4}$/i.test(part)
        ) {
          route = part;
          break;
        }
      }
      if (!route && parts.length >= 4) {
        const candidate = parts[parts.length - 2];
        if (candidate && candidate !== "Vehicle" && candidate !== "stcp") {
          route = candidate;
        }
      }
    }
  }

  // Extract direction and trip from annotations
  let directionId: number | null = null;
  let tripId: string | null = null;
  const annotations = unwrapAnnotations(entity.annotations);
  if (annotations) {
    for (const ann of annotations) {
      if (typeof ann !== "string") continue;
      if (ann.startsWith("stcp:sentido:")) {
        const match = ann.match(/stcp:sentido:(\d+)/);
        if (match?.[1]) directionId = parseInt(match[1], 10);
      } else if (ann.startsWith("stcp:nr_viagem:")) {
        tripId = ann.replace("stcp:nr_viagem:", "");
      }
    }
  }

  // Clean vehicle number
  let vehicleNum: string | null = null;
  const rawVehicleNum =
    unwrap(entity.vehiclePlateIdentifier) ||
    unwrap(entity.vehicleNumber) ||
    unwrap(entity.license_plate) ||
    unwrap(entity.name) ||
    entity.id.split(":").pop() ||
    "";

  if (rawVehicleNum) {
    const parts = String(rawVehicleNum).trim().split(/\s+/);
    const lastPart = parts[parts.length - 1];
    vehicleNum = lastPart && /^\d+$/.test(lastPart) ? lastPart : String(rawVehicleNum);
  }

  const speed = unwrap(entity.speed);
  const heading = unwrap(entity.heading) ?? unwrap(entity.bearing);

  return {
    vehicleId: entity.id,
    vehicleNum,
    route,
    tripId,
    directionId,
    lat: coords[1], // FIWARE returns [lon, lat]
    lon: coords[0],
    speed: speed !== undefined ? Number(speed) : null,
    heading: heading !== undefined ? Number(heading) : null,
  };
}

// ---------------------------------------------------------------------------
// Database insertion
// ---------------------------------------------------------------------------

async function insertRow(r: PositionRow): Promise<void> {
  await sql`
    INSERT INTO "BusPositionLog"
      ("recordedAt", "vehicleId", "vehicleNum", "route", "tripId", "directionId", "lat", "lon", "speed", "heading")
    VALUES
      (NOW(), ${r.vehicleId}, ${r.vehicleNum}, ${r.route}, ${r.tripId}, ${r.directionId}, ${r.lat}, ${r.lon}, ${r.speed}, ${r.heading})
  `;
}

async function insertBatch(rows: PositionRow[]): Promise<void> {
  if (rows.length === 0) return;
  // Use Promise.all for concurrent inserts within a batch
  // The neon serverless driver uses HTTP, so parallel requests are efficient
  await Promise.all(rows.map((r) => insertRow(r)));
}

// ---------------------------------------------------------------------------
// Collection cycle
// ---------------------------------------------------------------------------

/** Stats for monitoring */
let totalCollected = 0;
let totalCycles = 0;
let totalErrors = 0;

async function collectPositions(): Promise<void> {
  const start = Date.now();

  try {
    const response = await fetch(FIWARE_URL, {
      headers: {
        "User-Agent": "PortoMove-Collector/1.0",
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(15_000), // 15s timeout
    });

    if (!response.ok) {
      console.error(`FIWARE HTTP ${response.status} ${response.statusText}`);
      totalErrors++;
      return;
    }

    const entities: FiwareEntity[] = await response.json();

    if (!Array.isArray(entities) || entities.length === 0) {
      console.warn("FIWARE returned empty or non-array response");
      totalErrors++;
      return;
    }

    // Parse all entities
    const rows: PositionRow[] = [];
    for (const entity of entities) {
      if (!entity?.id || !entity?.location) continue;
      const row = parseEntity(entity);
      if (row) rows.push(row);
    }

    if (rows.length === 0) {
      console.warn("No valid positions parsed from FIWARE response");
      return;
    }

    // Insert in batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await insertBatch(batch);
    }

    totalCollected += rows.length;
    totalCycles++;
    const elapsed = Date.now() - start;

    // Log every cycle, with periodic summary
    if (totalCycles % 10 === 0) {
      console.log(
        `[cycle ${totalCycles}] ${rows.length} positions in ${elapsed}ms | total: ${totalCollected} positions, ${totalErrors} errors`
      );
    } else {
      console.log(`${rows.length} positions in ${elapsed}ms`);
    }
  } catch (error) {
    totalErrors++;
    const elapsed = Date.now() - start;
    console.error(`Collection failed after ${elapsed}ms:`, error);
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== PortoMove Position Collector ===");
  console.log(`Interval: ${INTERVAL_MS / 1000}s`);
  console.log(`Database: ${DATABASE_URL!.replace(/:[^:@]+@/, ":***@")}`); // mask password
  console.log(`FIWARE:   ${FIWARE_URL}`);
  console.log("");

  // Verify database connectivity
  try {
    await sql`SELECT 1 as ok`;
    console.log("Database connection: OK");
    // Verify the table exists
    await sql`SELECT COUNT(*) FROM "BusPositionLog" LIMIT 1`;
    console.log("BusPositionLog table: OK");
  } catch (error) {
    console.error("FATAL: Database connection failed:", error);
    process.exit(1);
  }

  console.log("\nStarting collection loop...\n");

  // Graceful shutdown
  let running = true;
  const shutdown = () => {
    console.log(
      `\nShutting down. Total: ${totalCollected} positions in ${totalCycles} cycles, ${totalErrors} errors.`
    );
    running = false;
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  while (running) {
    const cycleStart = Date.now();
    await collectPositions();
    const elapsed = Date.now() - cycleStart;
    const sleepMs = Math.max(0, INTERVAL_MS - elapsed);
    if (running && sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
