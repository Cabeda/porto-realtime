#!/usr/bin/env node
/**
 * FIWARE Bus Data Freshness Probe
 *
 * Polls the FIWARE Urban Platform at 1 req/s for 60 seconds and analyses
 * how frequently the upstream data is actually refreshed.
 *
 * Outputs:
 *  - A timeline of every detected change (wall-clock second within the minute)
 *  - Refresh interval statistics (min / max / avg / median)
 *  - A pattern detector: are refreshes aligned to specific second boundaries?
 *  - Per-vehicle change counts (which buses move most often)
 *
 * Usage:
 *   node tests/integration/fiware-freshness.mjs
 *   node tests/integration/fiware-freshness.mjs --duration=120   # 2 minutes
 *   node tests/integration/fiware-freshness.mjs --json            # machine-readable output
 */

import { createHash } from "crypto";

const FIWARE_URL =
  "https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0",
  Accept: "application/json",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.slice(2).split("=");
      return [k, v ?? true];
    })
);

const DURATION_S = parseInt(args.duration ?? "60", 10);
const JSON_OUTPUT = args.json === true;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fingerprint a FIWARE response: sorted list of "id:lat:lon:dateModified" */
function fingerprint(entities) {
  const parts = entities
    .map((e) => {
      const loc = e?.location?.value?.coordinates ?? [0, 0];
      const ts = e?.dateModified?.value ?? e?.timestamp?.value ?? "";
      return `${e.id}:${loc[0].toFixed(6)}:${loc[1].toFixed(6)}:${ts}`;
    })
    .sort();
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

/** Extract the latest dateModified across all entities */
function latestTimestamp(entities) {
  let latest = null;
  for (const e of entities) {
    const ts = e?.dateModified?.value ?? e?.timestamp?.value;
    if (ts) {
      const d = new Date(ts);
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

/** Count how many entities changed position vs previous snapshot */
function countChanges(prev, curr) {
  const prevMap = new Map(prev.map((e) => [e.id, e]));
  let changed = 0;
  for (const e of curr) {
    const p = prevMap.get(e.id);
    if (!p) {
      changed++;
      continue;
    }
    const pl = p?.location?.value?.coordinates ?? [];
    const cl = e?.location?.value?.coordinates ?? [];
    if (pl[0] !== cl[0] || pl[1] !== cl[1]) changed++;
  }
  return changed;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function log(...args) {
  if (!JSON_OUTPUT) console.log(...args);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function probe() {
  log(`\n🔍  FIWARE Freshness Probe — ${DURATION_S}s @ 1 req/s`);
  log(`    URL: ${FIWARE_URL}\n`);

  const samples = []; // { wallMs, wallSecInMinute, fp, entityCount, latestTs, responseMs }
  const changes = []; // { wallMs, wallSecInMinute, intervalMs, vehiclesChanged, prevFp, newFp }
  const vehicleChangeCounts = new Map();

  let prevEntities = null;
  let prevFp = null;
  let errors = 0;

  for (let i = 0; i < DURATION_S; i++) {
    const tickStart = Date.now();
    const wallMs = tickStart;
    const wallSecInMinute = new Date(wallMs).getSeconds();

    try {
      const res = await fetch(FIWARE_URL, { headers: HEADERS });
      const responseMs = Date.now() - tickStart;

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const entities = await res.json();
      if (!Array.isArray(entities)) throw new Error("Response is not an array");

      const fp = fingerprint(entities);
      const latestTs = latestTimestamp(entities);

      samples.push({
        wallMs,
        wallSecInMinute,
        fp,
        entityCount: entities.length,
        latestTs,
        responseMs,
      });

      if (prevFp !== null && fp !== prevFp) {
        const intervalMs = wallMs - (samples[samples.length - 2]?.wallMs ?? wallMs);
        const vehiclesChanged = prevEntities ? countChanges(prevEntities, entities) : 0;

        changes.push({
          wallMs,
          wallSecInMinute,
          intervalMs,
          vehiclesChanged,
          prevFp,
          newFp: fp,
        });

        // Track per-vehicle change counts
        if (prevEntities) {
          const prevMap = new Map(prevEntities.map((e) => [e.id, e]));
          for (const e of entities) {
            const p = prevMap.get(e.id);
            if (!p) continue;
            const pl = p?.location?.value?.coordinates ?? [];
            const cl = e?.location?.value?.coordinates ?? [];
            if (pl[0] !== cl[0] || pl[1] !== cl[1]) {
              vehicleChangeCounts.set(e.id, (vehicleChangeCounts.get(e.id) ?? 0) + 1);
            }
          }
        }

        log(
          `  ✓ Change at t+${String(i).padStart(2, "0")}s  ` +
            `(wall :${String(wallSecInMinute).padStart(2, "0")})  ` +
            `${vehiclesChanged} vehicles moved  ` +
            `fp ${prevFp} → ${fp}`
        );
      } else if (i === 0) {
        log(
          `  · t+00s  baseline  fp=${fp}  entities=${entities.length}  latestTs=${latestTs?.toISOString() ?? "n/a"}`
        );
      } else {
        process.stdout.write && !JSON_OUTPUT && process.stdout.write(".");
      }

      prevFp = fp;
      prevEntities = entities;
    } catch (err) {
      errors++;
      log(`  ✗ t+${String(i).padStart(2, "0")}s  ERROR: ${err.message}`);
    }

    // Sleep until next 1-second tick
    const elapsed = Date.now() - tickStart;
    const sleep = Math.max(0, 1000 - elapsed);
    await new Promise((r) => setTimeout(r, sleep));
  }

  if (!JSON_OUTPUT) console.log(); // newline after dots

  // ── Analysis ────────────────────────────────────────────────────────────────

  const intervals = changes.map((c) => c.intervalMs);
  const secondsOfChange = changes.map((c) => c.wallSecInMinute);

  // Bucket changes by second-within-minute to detect alignment
  const secondBuckets = {};
  for (const s of secondsOfChange) {
    secondBuckets[s] = (secondBuckets[s] ?? 0) + 1;
  }

  // Detect dominant refresh period (most common interval rounded to nearest second)
  const roundedIntervals = intervals.map((ms) => Math.round(ms / 1000));
  const intervalFreq = {};
  for (const s of roundedIntervals) {
    intervalFreq[s] = (intervalFreq[s] ?? 0) + 1;
  }
  const dominantInterval = Object.entries(intervalFreq).sort((a, b) => b[1] - a[1])[0];

  // Detect if changes cluster around specific seconds (±2s window)
  const dominantSecond = Object.entries(secondBuckets).sort((a, b) => b[1] - a[1])[0];

  // Detect consecutive-second burst clusters (e.g. :26/:27/:28 all firing together)
  const secondKeys = Object.keys(secondBuckets)
    .map(Number)
    .sort((a, b) => a - b);
  let longestRun = 0,
    currentRun = 1,
    burstStart = secondKeys[0];
  let bestBurstStart = secondKeys[0],
    bestBurstEnd = secondKeys[0];
  for (let i = 1; i < secondKeys.length; i++) {
    if (secondKeys[i] === secondKeys[i - 1] + 1) {
      currentRun++;
      if (currentRun > longestRun) {
        longestRun = currentRun;
        bestBurstStart = burstStart;
        bestBurstEnd = secondKeys[i];
      }
    } else {
      currentRun = 1;
      burstStart = secondKeys[i];
    }
  }
  if (longestRun === 0 && secondKeys.length > 0) longestRun = 1;

  // Count changes within the dominant burst window
  const burstChanges = secondsOfChange.filter(
    (s) => s >= bestBurstStart && s <= bestBurstEnd
  ).length;
  const burstCoverage = changes.length ? burstChanges / changes.length : 0;
  const hasBurstPattern = longestRun >= 2 && burstCoverage >= 0.7;

  // Compute inter-burst intervals (time between first change of each burst)
  // A new burst starts when the gap to the previous change is > 5s
  const burstStarts = [];
  for (let i = 0; i < changes.length; i++) {
    const gapToPrev = i === 0 ? Infinity : changes[i].wallMs - changes[i - 1].wallMs;
    if (gapToPrev > 5000) burstStarts.push(changes[i].wallMs);
  }
  const burstIntervals = burstStarts.slice(1).map((t, i) => t - burstStarts[i]);
  const avgBurstInterval = burstIntervals.length
    ? Math.round(burstIntervals.reduce((a, b) => a + b, 0) / burstIntervals.length)
    : null;

  const hasSecondPattern =
    hasBurstPattern ||
    (dominantSecond && parseInt(dominantSecond[1]) >= Math.ceil(changes.length * 0.4));

  const report = {
    probe: {
      url: FIWARE_URL,
      durationSeconds: DURATION_S,
      totalSamples: samples.length,
      errors,
      startTime: samples[0] ? new Date(samples[0].wallMs).toISOString() : null,
      endTime: samples[samples.length - 1]
        ? new Date(samples[samples.length - 1].wallMs).toISOString()
        : null,
    },
    freshness: {
      totalChangesDetected: changes.length,
      uniqueSnapshots: new Set(samples.map((s) => s.fp)).size,
      avgVehiclesPerSnapshot: samples.length
        ? Math.round(samples.reduce((a, s) => a + s.entityCount, 0) / samples.length)
        : 0,
    },
    intervals: {
      minMs: intervals.length ? Math.min(...intervals) : null,
      maxMs: intervals.length ? Math.max(...intervals) : null,
      avgMs: intervals.length
        ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
        : null,
      medianMs: median(intervals),
      dominantIntervalSeconds: dominantInterval ? parseInt(dominantInterval[0]) : null,
      allIntervalsMs: intervals,
    },
    pattern: {
      secondsOfChange,
      secondBuckets,
      dominantSecond: dominantSecond ? parseInt(dominantSecond[0]) : null,
      dominantSecondCount: dominantSecond ? parseInt(dominantSecond[1]) : null,
      hasAlignmentPattern: hasSecondPattern,
      burstWindow: hasBurstPattern ? `${bestBurstStart}–${bestBurstEnd}` : null,
      burstDurationSeconds: hasBurstPattern ? longestRun : null,
      avgBurstIntervalMs: avgBurstInterval,
      interpretation: hasBurstPattern
        ? `Data arrives in a ~${longestRun}s burst at seconds :${String(bestBurstStart).padStart(2, "0")}–:${String(bestBurstEnd).padStart(2, "0")} of each minute (~every ${avgBurstInterval ? Math.round(avgBurstInterval / 1000) : "?"}s)`
        : hasSecondPattern
          ? `Refreshes appear to align around second :${String(dominantSecond[0]).padStart(2, "0")} of each minute`
          : "No strong second-alignment pattern detected",
    },
    topMovingVehicles: [...vehicleChangeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ id, changeCount: count })),
    changeTimeline: changes.map((c) => ({
      wallTime: new Date(c.wallMs).toISOString(),
      wallSecInMinute: c.wallSecInMinute,
      intervalMs: c.intervalMs,
      vehiclesChanged: c.vehiclesChanged,
    })),
  };

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  // ── Human-readable summary ──────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  FIWARE FRESHNESS REPORT");
  console.log("═".repeat(60));

  console.log(`\n📊  Probe summary`);
  console.log(`    Duration      : ${DURATION_S}s`);
  console.log(`    Samples taken : ${report.probe.totalSamples}  (errors: ${errors})`);
  console.log(`    Avg vehicles  : ${report.freshness.avgVehiclesPerSnapshot}`);

  console.log(`\n🔄  Refresh frequency`);
  if (changes.length === 0) {
    console.log("    ⚠️  No data changes detected during the probe window.");
    console.log("    The API may be returning cached/static data, or the probe");
    console.log("    window was too short to catch a refresh cycle.");
  } else {
    console.log(`    Changes detected  : ${changes.length}`);
    console.log(`    Unique snapshots  : ${report.freshness.uniqueSnapshots}`);
    if (avgBurstInterval) {
      console.log(
        `    Refresh cycle     : ~${Math.round(avgBurstInterval / 1000)}s between bursts`
      );
    }
    console.log(`    Within-burst min  : ${report.intervals.minMs}ms`);
    console.log(`    Within-burst max  : ${report.intervals.maxMs}ms`);
    console.log(
      `    Dominant period  : ~${report.intervals.dominantIntervalSeconds}s ` +
        `(${dominantInterval?.[1]} of ${changes.length} changes)`
    );
  }

  console.log(`\n🕐  Second-alignment pattern`);
  console.log(`    ${report.pattern.interpretation}`);
  if (Object.keys(secondBuckets).length) {
    console.log(`    Change distribution by second-within-minute:`);
    const sorted = Object.entries(secondBuckets).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    for (const [sec, count] of sorted) {
      const bar = "█".repeat(count);
      const marker =
        hasBurstPattern && parseInt(sec) >= bestBurstStart && parseInt(sec) <= bestBurstEnd
          ? " ◀ burst"
          : "";
      console.log(`      :${String(sec).padStart(2, "0")}  ${bar} (${count})${marker}`);
    }
  }

  if (report.topMovingVehicles.length) {
    console.log(`\n🚌  Top 5 most-updated vehicles`);
    for (const v of report.topMovingVehicles.slice(0, 5)) {
      console.log(
        `    ${v.id.split(":").slice(-2).join(":")}  — ${v.changeCount} position updates`
      );
    }
  }

  console.log(`\n📋  Change timeline`);
  if (report.changeTimeline.length === 0) {
    console.log("    (no changes)");
  } else {
    for (const c of report.changeTimeline) {
      console.log(
        `    ${c.wallTime}  :${String(c.wallSecInMinute).padStart(2, "0")}  ` +
          `+${(c.intervalMs / 1000).toFixed(1)}s  ${c.vehiclesChanged} vehicles`
      );
    }
  }

  console.log("\n" + "═".repeat(60) + "\n");

  return report;
}

probe().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
