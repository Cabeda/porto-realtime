import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const OTP_URL = 'https://otp.portodigital.pt/otp/routers/default/index/graphql';
const FIWARE_URL = 'https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000';

async function getOTPBuses701() {
  const res = await fetch(OTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://explore.porto.pt' },
    body: JSON.stringify({ query: `{
      routes(feeds: ["2"], name: "701") {
        shortName longName
        patterns { headsign directionId vehiclePositions {
          vehicleId lat lon heading speed label lastUpdated
          trip { gtfsId }
          stopRelationship { status }
        }}
      }
    }` }),
  });
  const data = await res.json();
  const positions = [];
  for (const route of data.data.routes) {
    for (const pattern of route.patterns) {
      for (const vp of pattern.vehiclePositions) {
        positions.push({ ...vp, routeShortName: route.shortName, routeLongName: route.longName, headsign: pattern.headsign, directionId: pattern.directionId });
      }
    }
  }
  return positions;
}

async function getFIWAREBuses701() {
  const res = await fetch(FIWARE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
  });
  const data = await res.json();
  return data.filter(e => {
    const annotations = e.annotations?.value || [];
    return annotations.some(a => a === 'stcp:route:701');
  }).map(e => {
    const coords = e.location?.value?.coordinates || [0, 0];
    const annotations = e.annotations?.value || [];
    const viagem = annotations.find(a => a.startsWith('stcp:nr_viagem:'));
    const sentido = annotations.find(a => a.startsWith('stcp:sentido:'));
    return {
      id: e.id,
      vehicleId: e.fleetVehicleId?.value || e.id.split(':').pop(),
      lat: coords[1],
      lon: coords[0],
      heading: e.heading?.value || e.bearing?.value || 0,
      speed: e.speed?.value || 0,
      tripId: viagem ? viagem.replace('stcp:nr_viagem:', '') : null,
      directionId: sentido ? parseInt(sentido.replace('stcp:sentido:', '')) : null,
      lastUpdated: e.observationDateTime?.value || e.dateModified?.value,
      label: e.name?.value,
    };
  });
}

describe('Route 701: OTP vs FIWARE comparison', () => {
  let otpBuses, fiwareBuses;

  it('fetch both sources', async () => {
    [otpBuses, fiwareBuses] = await Promise.all([getOTPBuses701(), getFIWAREBuses701()]);
    console.log(`\n  OTP vehicles:    ${otpBuses.length}`);
    console.log(`  FIWARE vehicles: ${fiwareBuses.length}`);
  });

  it('both sources return buses for route 701', () => {
    assert.ok(otpBuses.length > 0, 'OTP should have 701 buses');
    assert.ok(fiwareBuses.length > 0, 'FIWARE should have 701 buses');
  });

  it('vehicle counts are similar', () => {
    const diff = Math.abs(otpBuses.length - fiwareBuses.length);
    console.log(`\n  Count difference: ${diff}`);
    // Allow some variance — FIWARE may include parked/depot buses, but require reasonable similarity
    const maxCount = Math.max(otpBuses.length, fiwareBuses.length);
    const allowedDiff = 0.3 * maxCount; // allow up to 30% difference
    assert.ok(diff <= allowedDiff, `Counts should be within 30% of each other (diff=${diff}, max=${maxCount})`);
  });

  it('trip IDs match between sources', () => {
    const otpTrips = new Set(otpBuses.map(b => b.trip.gtfsId.replace(/^2:/, '')));
    const fiwareTrips = new Set(fiwareBuses.filter(b => b.tripId).map(b => b.tripId));
    const common = [...otpTrips].filter(t => fiwareTrips.has(t));
    const otpOnly = [...otpTrips].filter(t => !fiwareTrips.has(t));
    const fiwareOnly = [...fiwareTrips].filter(t => !otpTrips.has(t));
    console.log(`\n  Matching trips:    ${common.length}`);
    console.log(`  OTP-only trips:   ${otpOnly.length} ${otpOnly.length > 0 ? otpOnly.slice(0, 3).join(', ') : ''}`);
    console.log(`  FIWARE-only trips: ${fiwareOnly.length} ${fiwareOnly.length > 0 ? fiwareOnly.slice(0, 3).join(', ') : ''}`);
  });

  it('vehicle IDs match between sources', () => {
    // OTP vehicleId format: "2:1215", FIWARE: "1215" or from fleetVehicleId
    const otpIds = new Set(otpBuses.map(b => b.vehicleId.replace(/^2:/, '')));
    const fiwareIds = new Set(fiwareBuses.map(b => String(b.vehicleId)));
    const common = [...otpIds].filter(id => fiwareIds.has(id));
    const otpOnly = [...otpIds].filter(id => !fiwareIds.has(id));
    const fiwareOnly = [...fiwareIds].filter(id => !otpIds.has(id));
    console.log(`\n  Matching vehicles:    ${common.length}`);
    console.log(`  OTP-only vehicles:   ${otpOnly.length} ${otpOnly.slice(0, 5).join(', ')}`);
    console.log(`  FIWARE-only vehicles: ${fiwareOnly.length} ${fiwareOnly.slice(0, 5).join(', ')}`);
  });

  it('GPS positions are close for matched vehicles', () => {
    const otpByVehicle = new Map(otpBuses.map(b => [b.vehicleId.replace(/^2:/, ''), b]));
    const diffs = [];
    for (const fb of fiwareBuses) {
      const ob = otpByVehicle.get(String(fb.vehicleId));
      if (!ob) continue;
      const dLat = Math.abs(ob.lat - fb.lat);
      const dLon = Math.abs(ob.lon - fb.lon);
      const distMeters = Math.sqrt(dLat ** 2 + dLon ** 2) * 111320;
      diffs.push({ vehicle: fb.vehicleId, distMeters: Math.round(distMeters), otpLat: ob.lat, fiwareLat: fb.lat, otpLon: ob.lon, fiwareLon: fb.lon, headingDiff: Math.abs((ob.heading || 0) - fb.heading), speedDiff: Math.abs((ob.speed || 0) - fb.speed) });
    }
    diffs.sort((a, b) => b.distMeters - a.distMeters);
    console.log(`\n  Matched ${diffs.length} vehicles by ID`);
    if (diffs.length > 0) {
      const avgDist = Math.round(diffs.reduce((s, d) => s + d.distMeters, 0) / diffs.length);
      const maxDist = diffs[0].distMeters;
      const avgHeading = Math.round(diffs.reduce((s, d) => s + d.headingDiff, 0) / diffs.length);
      const avgSpeed = (diffs.reduce((s, d) => s + d.speedDiff, 0) / diffs.length).toFixed(1);
      console.log(`  Avg GPS distance:  ${avgDist}m`);
      console.log(`  Max GPS distance:  ${maxDist}m (vehicle ${diffs[0].vehicle})`);
      console.log(`  Avg heading diff:  ${avgHeading}°`);
      console.log(`  Avg speed diff:    ${avgSpeed} km/h`);
      console.log(`\n  Top 3 largest GPS differences:`);
      diffs.slice(0, 3).forEach(d => console.log(`    Vehicle ${d.vehicle}: ${d.distMeters}m apart, heading ±${d.headingDiff}°, speed ±${d.speedDiff.toFixed(1)}`));
    }
  });

  it('timestamp freshness comparison', () => {
    const now = Date.now();
    const otpAges = otpBuses.map(b => (now - b.lastUpdated * 1000) / 1000);
    const fiwareAges = fiwareBuses.map(b => (now - new Date(b.lastUpdated).getTime()) / 1000);
    const avgOtp = Math.round(otpAges.reduce((s, a) => s + a, 0) / otpAges.length);
    const avgFiware = Math.round(fiwareAges.reduce((s, a) => s + a, 0) / fiwareAges.length);
    console.log(`\n  Avg OTP data age:    ${avgOtp}s`);
    console.log(`  Avg FIWARE data age: ${avgFiware}s`);
  });
});
