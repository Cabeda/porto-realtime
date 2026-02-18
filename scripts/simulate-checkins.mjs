#!/usr/bin/env node

/**
 * Simulate random check-in usage on the PortoMove platform.
 *
 * Usage:
 *   node scripts/simulate-checkins.mjs [count] [baseUrl]
 *
 * Examples:
 *   node scripts/simulate-checkins.mjs 10          # 10 check-ins on localhost:3000
 *   node scripts/simulate-checkins.mjs 100          # 100 check-ins (high traffic)
 *   node scripts/simulate-checkins.mjs 500 https://portomove.example.com
 *
 * Each simulated check-in picks a random transit mode, a random target,
 * and a random location within the Porto metro area.
 */

const BASE_URL = process.argv[3] || "http://localhost:3000";
const COUNT = parseInt(process.argv[2] || "20", 10);

// Porto metro area bounding box
const PORTO_LAT_MIN = 41.12;
const PORTO_LAT_MAX = 41.19;
const PORTO_LON_MIN = -8.68;
const PORTO_LON_MAX = -8.57;

const MODES = ["BUS", "METRO", "BIKE", "WALK", "SCOOTER"];

// Sample targets per mode
const TARGETS = {
  BUS: ["200", "201", "205", "207", "300", "301", "305", "400", "401", "500", "501", "502", "600", "601", "700", "ZR"],
  METRO: ["A", "B", "C", "D", "E", "F"],
  BIKE: ["Ciclovia da Foz", "Ciclovia da Boavista", "Ciclovia do Campo Alegre", "Ciclovia da Ribeira", "Ciclovia de Paranhos"],
  WALK: [null],
  SCOOTER: [null],
};

// Well-known Porto locations for more realistic distribution
const HOTSPOTS = [
  { name: "Aliados", lat: 41.1496, lon: -8.6109 },
  { name: "São Bento", lat: 41.1459, lon: -8.6103 },
  { name: "Trindade", lat: 41.1519, lon: -8.6094 },
  { name: "Bolhão", lat: 41.1500, lon: -8.6060 },
  { name: "Casa da Música", lat: 41.1585, lon: -8.6306 },
  { name: "Foz do Douro", lat: 41.1500, lon: -8.6750 },
  { name: "Ribeira", lat: 41.1408, lon: -8.6132 },
  { name: "Campanhã", lat: 41.1487, lon: -8.5856 },
  { name: "Boavista", lat: 41.1580, lon: -8.6290 },
  { name: "Paranhos", lat: 41.1630, lon: -8.6050 },
  { name: "Hospital São João", lat: 41.1830, lon: -8.6010 },
  { name: "Matosinhos", lat: 41.1850, lon: -8.6900 },
  { name: "Gaia (Serra do Pilar)", lat: 41.1370, lon: -8.6090 },
  { name: "Estádio do Dragão", lat: 41.1617, lon: -8.5836 },
];

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomLocation() {
  // 70% chance to be near a hotspot, 30% random in Porto area
  if (Math.random() < 0.7) {
    const hotspot = randomChoice(HOTSPOTS);
    return {
      lat: hotspot.lat + randomFloat(-0.003, 0.003), // ~300m jitter
      lon: hotspot.lon + randomFloat(-0.003, 0.003),
    };
  }
  return {
    lat: randomFloat(PORTO_LAT_MIN, PORTO_LAT_MAX),
    lon: randomFloat(PORTO_LON_MIN, PORTO_LON_MAX),
  };
}

async function simulateCheckIn(index) {
  const mode = randomChoice(MODES);
  const targetId = randomChoice(TARGETS[mode]);
  const { lat, lon } = randomLocation();

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
  console.log(`Modes: ${MODES.join(", ")}`);
  console.log(`Porto area: ${PORTO_LAT_MIN}–${PORTO_LAT_MAX}°N, ${PORTO_LON_MIN}–${PORTO_LON_MAX}°W`);
  console.log(`Hotspots: ${HOTSPOTS.length} locations\n`);

  const startTime = Date.now();

  // Send check-ins in batches of 10 to avoid overwhelming the server
  const BATCH_SIZE = 10;
  for (let i = 0; i < COUNT; i += BATCH_SIZE) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH_SIZE, COUNT); j++) {
      batch.push(simulateCheckIn(j));
    }
    await Promise.all(batch);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done! ${COUNT} check-ins in ${elapsed}s`);

  // Fetch stats to show the result
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

  // Fetch active check-ins to show map activity
  try {
    const activeRes = await fetch(`${BASE_URL}/api/checkin/active`);
    const active = await activeRes.json();
    console.log(`\n🗺️  Active on map: ${active.checkIns.length} check-ins with locations`);
  } catch {
    console.log("\n⚠️  Could not fetch active check-ins");
  }
}

main();
