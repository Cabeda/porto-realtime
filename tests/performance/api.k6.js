/**
 * k6 load test for core (non-analytics) API endpoints.
 *
 * Usage:
 *   pnpm test:load:api              # against localhost:3000
 *   BASE_URL=https://... pnpm test:load:api
 *
 * Thresholds:
 *   - Cached/static routes  (stations, routes, shapes, bike-lanes): p(95) < 200ms
 *   - Real-time routes      (buses, station, bike-parks):            p(95) < 500ms
 *   - DB-backed routes      (feedback, rankings, contributors, etc): p(95) < 500ms
 *   - Error rate < 1% across all endpoints
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// ── Per-endpoint latency trends ──────────────────────────────────────────────
const trends = {
  // Real-time (external APIs, refreshed frequently)
  buses: new Trend("buses_ms", true),
  station: new Trend("station_ms", true),
  bike_parks: new Trend("bike_parks_ms", true),

  // Cached / semi-static (OTP data, long TTL)
  stations: new Trend("stations_ms", true),
  routes: new Trend("routes_ms", true),
  route_shapes: new Trend("route_shapes_ms", true),
  line: new Trend("line_ms", true),
  bike_lanes: new Trend("bike_lanes_ms", true),

  // DB-backed (Prisma / Neon)
  feedback: new Trend("feedback_ms", true),
  feedback_summary: new Trend("feedback_summary_ms", true),
  feedback_rankings: new Trend("feedback_rankings_ms", true),
  feedback_trending: new Trend("feedback_trending_ms", true),
  contributors: new Trend("contributors_ms", true),
  digest: new Trend("digest_ms", true),
  proposals: new Trend("proposals_ms", true),
};

const errorRate = new Rate("errors");

// ── Load profile ─────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    core_api: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "15s", target: 10 }, // ramp up
        { duration: "30s", target: 10 }, // steady state
        { duration: "10s", target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    // Real-time endpoints — tolerate upstream latency
    buses_ms: ["p(95)<500"],
    station_ms: ["p(95)<500"],
    bike_parks_ms: ["p(95)<500"],

    // Cached / semi-static — should be fast
    stations_ms: ["p(95)<200"],
    routes_ms: ["p(95)<200"],
    route_shapes_ms: ["p(95)<200"],
    line_ms: ["p(95)<200"],
    bike_lanes_ms: ["p(95)<200"],

    // DB-backed — allow for query time
    feedback_ms: ["p(95)<500"],
    feedback_summary_ms: ["p(95)<500"],
    feedback_rankings_ms: ["p(95)<500"],
    feedback_trending_ms: ["p(95)<500"],
    contributors_ms: ["p(95)<500"],
    digest_ms: ["p(95)<500"],
    proposals_ms: ["p(95)<500"],

    errors: ["rate<0.01"],
  },
};

// ── Helper ────────────────────────────────────────────────────────────────────
function req(url, trend) {
  const res = http.get(`${BASE_URL}${url}`, {
    headers: { Accept: "application/json" },
    timeout: "15s",
  });
  trend.add(res.timings.duration);
  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "has body": (r) => r.body !== null && r.body !== undefined,
  });
  errorRate.add(!ok);
  return res;
}

// ── Virtual user scenario ─────────────────────────────────────────────────────
export default function () {
  // ── Real-time ──────────────────────────────────────────────────────────────
  group("buses", () => {
    req("/api/buses", trends.buses);
  });
  sleep(0.3);

  group("station-departures", () => {
    req("/api/station?gtfsId=2:BRRS2", trends.station);
    sleep(0.2);
    req("/api/station?gtfsId=2:CAMP1", trends.station);
  });
  sleep(0.3);

  group("bike-parks", () => {
    req("/api/bike-parks", trends.bike_parks);
  });
  sleep(0.3);

  // ── Cached / semi-static ───────────────────────────────────────────────────
  group("stations", () => {
    req("/api/stations", trends.stations);
  });
  sleep(0.3);

  group("routes", () => {
    req("/api/routes", trends.routes);
  });
  sleep(0.3);

  group("route-shapes", () => {
    req("/api/route-shapes", trends.route_shapes);
  });
  sleep(0.3);

  group("line", () => {
    req("/api/line?id=205", trends.line);
    sleep(0.2);
    req("/api/line?id=301", trends.line);
  });
  sleep(0.3);

  group("bike-lanes", () => {
    req("/api/bike-lanes", trends.bike_lanes);
  });
  sleep(0.3);

  // ── DB-backed ──────────────────────────────────────────────────────────────
  group("feedback", () => {
    req("/api/feedback?type=LINE&targetId=205&limit=20", trends.feedback);
    sleep(0.2);
    req("/api/feedback?type=STOP&targetId=2:BRRS2&limit=20", trends.feedback);
  });
  sleep(0.3);

  group("feedback-summary", () => {
    req(
      "/api/feedback/summary?type=STOP&targetIds=2:BRRS2,2:CAMP1,2:TRND1",
      trends.feedback_summary
    );
    sleep(0.2);
    req("/api/feedback/summary?type=LINE&targetIds=205,301,500", trends.feedback_summary);
  });
  sleep(0.3);

  group("feedback-rankings", () => {
    req("/api/feedback/rankings?type=LINE&sort=avg&order=desc&limit=20", trends.feedback_rankings);
    sleep(0.2);
    req(
      "/api/feedback/rankings?type=STOP&sort=count&order=desc&limit=20",
      trends.feedback_rankings
    );
  });
  sleep(0.3);

  group("feedback-trending", () => {
    req("/api/feedback/trending?period=week&limit=10", trends.feedback_trending);
    sleep(0.2);
    req("/api/feedback/trending?period=month&limit=10", trends.feedback_trending);
  });
  sleep(0.3);

  group("contributors", () => {
    req("/api/contributors", trends.contributors);
  });
  sleep(0.3);

  group("digest", () => {
    req("/api/digest/data", trends.digest);
  });
  sleep(0.3);

  group("proposals", () => {
    req("/api/proposals?type=BIKE_LANE&status=OPEN&limit=20", trends.proposals);
    sleep(0.2);
    req("/api/proposals?type=STOP&limit=20", trends.proposals);
  });

  sleep(0.5);
}
