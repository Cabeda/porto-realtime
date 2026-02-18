#!/usr/bin/env node

/**
 * Simulate random check-in usage on the PortoMove platform.
 *
 * Fetches real infrastructure data (stops, bike lanes, bike parks) from the API
 * and attaches each check-in to the nearest entity for its mode.
 *
 * Usage:
 *   node scripts/simulate-checkins.mjs [count] [baseUrl]
 *
 * Examples:
 *   node scripts/simulate-checkins.mjs 10          # 10 check-ins on localhost:3000
 *   node scripts/simulate-checkins.mjs 100          # 100 check-ins (high traffic)
 */

const BASE_URL = process.argv[3] || "http://localhost:3000";
const COUNT = parseInt(process.argv[2] || "20", 10);

const MODES = ["BUS", "METRO", "BIKE", "WALK", "SCOOTER"];

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Compute midpoint [lat, lon] of a bike lane from its segments (segments are [lon, lat][][]). */
function laneMidpoint(segments) {
  // Flatten all coords, pick the middle one
  const allCoords = [];
  for (const seg of segments) {
    for (const coord of seg) {
      allCoords.push(coord);
    }
  }
  if (allCoords.length === 0) return null;
  const mid = allCoords[Math.floor(allCoords.length / 2)];
  return { lat: mid[1], lon: mid[0] }; // flip [lon, lat] → { lat, lon }
}

async function fetchInfrastructure() {
  console.log("📡 Fetching infrastructure data...");

  const [stopsRes, bikeLanesRes, bikeParksRes] = await Promise.all([
    fetch(`${BASE_URL}/api/stations`).then(r => r.json()).catch(() => null),
    fetch(`${BASE_URL}/api/bike-lanes`).then(r => r.json()).catch(() => null),
    fetch(`${BASE_URL}/api/bike-parks`).then(r => r.json()).catch(() => null),
  ]);

  const stops = stopsRes?.data?.stops || [];
  const bikeLanes = bikeLanesRes?.lanes || [];
  const bikeParks = bikeParksRes?.parks || [];

  // Filter stops by vehicle mode for more realistic targeting
  const busStops = stops.filter(s => s.vehicleMode === "BUS" && s.lat && s.lon);
  const metroStops = stops.filter(s => s.vehicleMode === "RAIL" || s.vehicleMode === "SUBWAY" || s.vehicleMode === "TRAM");
  const allStops = stops.filter(s => s.lat && s.lon);

  // Pre-compute bike lane midpoints
  const laneTargets = bikeLanes
    .filter(l => l.segments && l.segments.length > 0)
    .map(l => {
      const mid = laneMidpoint(l.segments);
      return mid ? { name: l.name, ...mid } : null;
    })
    .filter(Boolean);

  const parkTargets = bikeParks.filter(p => p.lat && p.lon);

  console.log(`   Stops: ${allStops.length} (${busStops.length} bus, ${metroStops.length} metro)`);
  console.log(`   Bike lanes: ${laneTargets.length}`);
  console.log(`   Bike parks: ${parkTargets.length}\n`);

  return { busStops, metroStops, allStops, laneTargets, parkTargets };
}

function pickTarget(mode, infra) {
  switch (mode) {
    case "BUS": {
      if (infra.busStops.length === 0) return { targetId: "200", lat: 41.1496, lon: -8.6109 };
      const stop = randomChoice(infra.busStops);
      return { targetId: stop.code || stop.gtfsId, lat: stop.lat, lon: stop.lon };
    }
    case "METRO": {
      const pool = infra.metroStops.length > 0 ? infra.metroStops : infra.allStops;
      if (pool.length === 0) return { targetId: "A", lat: 41.1519, lon: -8.6094 };
      const stop = randomChoice(pool);
      // Metro lines: A-F
      const line = randomChoice(["A", "B", "C", "D", "E", "F"]);
      return { targetId: line, lat: stop.lat, lon: stop.lon };
    }
    case "BIKE": {
      // 70% bike lane, 30% bike park
      if (Math.random() < 0.7 && infra.laneTargets.length > 0) {
        const lane = randomChoice(infra.laneTargets);
        return { targetId: lane.name, lat: lane.lat, lon: lane.lon };
      }
      if (infra.parkTargets.length > 0) {
        const park = randomChoice(infra.parkTargets);
        return { targetId: park.name || park.id, lat: park.lat, lon: park.lon };
      }
      return { targetId: null, lat: 41.1580, lon: -8.6290 };
    }
    case "WALK":
    case "SCOOTER": {
      // Attach to nearest stop as reference point
      if (infra.allStops.length === 0) return { targetId: null, lat: 41.1496, lon: -8.6109 };
      const stop = randomChoice(infra.allStops);
      return { targetId: null, lat: stop.lat, lon: stop.lon };
    }
    default:
      return { targetId: null, lat: 41.1496, lon: -8.6109 };
  }
}

async function simulateCheckIn(index, infra) {
  const mode = randomChoice(MODES);
  const { targetId, lat, lon } = pickTarget(mode, infra);

  const body = { mode, lat, lon };
  if (targetId) body.targetId = targetId;

  try {
    const res = await fetch(`${BASE_URL}/api/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (res.ok) {
      const target = targetId ? ` → ${targetId}` : "";
      console.log(
        `✓ [${String(index + 1).padStart(4)}/${COUNT}] ${mode}${target} @ (${lat.toFixed(4)}, ${lon.toFixed(4)}) — expires ${data.checkIn?.expiresAt || "?"}`
      );
    } else {
      console.log(`✗ [${String(index + 1).padStart(4)}/${COUNT}] ${mode} — ${data.error || res.status}`);
    }
  } catch (err) {
    console.log(`✗ [${String(index + 1).padStart(4)}/${COUNT}] ${mode} — ${err.message}`);
  }
}

async function main() {
  console.log(`\n🚌 Simulating ${COUNT} anonymous check-ins on ${BASE_URL}\n`);

  const infra = await fetchInfrastructure();

  const startTime = Date.now();

  // Send check-ins in batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < COUNT; i += BATCH_SIZE) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH_SIZE, COUNT); j++) {
      batch.push(simulateCheckIn(j, infra));
    }
    await Promise.all(batch);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done! ${COUNT} check-ins in ${elapsed}s`);

  // Fetch stats
  try {
    const statsRes = await fetch(`${BASE_URL}/api/checkin/stats`);
    const stats = await statsRes.json();
    console.log(`\n📊 Current stats:`);
    console.log(`   Active: ${stats.total} check-ins`);
    console.log(`   Today:  ${stats.todayTotal} total`);
    console.log(`   By mode:`, stats.byMode);
  } catch {
    console.log("\n⚠️  Could not fetch stats");
  }

  // Fetch active check-ins
  try {
    const activeRes = await fetch(`${BASE_URL}/api/checkin/active`);
    const active = await activeRes.json();
    console.log(`\n🗺️  Active on map: ${active.checkIns.length} check-ins with locations`);
  } catch {
    console.log("\n⚠️  Could not fetch active check-ins");
  }
}

main();
