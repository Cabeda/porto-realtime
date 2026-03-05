/**
 * k6 load test for analytics API endpoints.
 *
 * Usage:
 *   pnpm test:load              # against localhost:3000
 *   BASE_URL=https://... pnpm test:load
 *
 * Pass threshold: p(95) of response time < 500ms per endpoint.
 * Each endpoint is tested with the most common query params.
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

// Per-endpoint latency trends so failures are easy to pinpoint
const trends = {
  network_summary: new Trend("network_summary_ms", true),
  speed_timeseries: new Trend("speed_timeseries_ms", true),
  fleet_activity: new Trend("fleet_activity_ms", true),
  reliability: new Trend("reliability_ms", true),
  cancellations: new Trend("cancellations_ms", true),
  line: new Trend("line_ms", true),
  segment_speeds: new Trend("segment_speeds_ms", true),
  stop_headways: new Trend("stop_headways_ms", true),
  vehicle: new Trend("vehicle_ms", true),
};

const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    analytics: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "15s", target: 5 }, // ramp up
        { duration: "30s", target: 5 }, // steady
        { duration: "10s", target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    // Every endpoint must respond in under 500ms at p95
    network_summary_ms: ["p(95)<500"],
    speed_timeseries_ms: ["p(95)<500"],
    fleet_activity_ms: ["p(95)<500"],
    reliability_ms: ["p(95)<500"],
    cancellations_ms: ["p(95)<500"],
    line_ms: ["p(95)<500"],
    segment_speeds_ms: ["p(95)<500"],
    stop_headways_ms: ["p(95)<500"],
    vehicle_ms: ["p(95)<500"],
    errors: ["rate<0.01"], // <1% error rate
  },
};

function req(url, trend) {
  const res = http.get(`${BASE_URL}${url}`, {
    headers: { Accept: "application/json" },
    timeout: "10s",
  });
  trend.add(res.timings.duration);
  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "has json body": (r) => r.body && r.body.length > 2,
  });
  errorRate.add(!ok);
  return res;
}

export default function () {
  group("network-summary", () => {
    req("/api/analytics/network-summary?period=today", trends.network_summary);
    sleep(0.2);
    req("/api/analytics/network-summary?period=7d", trends.network_summary);
  });

  sleep(0.3);

  group("speed-timeseries", () => {
    req("/api/analytics/speed-timeseries?period=today", trends.speed_timeseries);
    sleep(0.2);
    req("/api/analytics/speed-timeseries?period=7d", trends.speed_timeseries);
  });

  sleep(0.3);

  group("fleet-activity", () => {
    req("/api/analytics/fleet-activity?period=today", trends.fleet_activity);
    sleep(0.2);
    req("/api/analytics/fleet-activity?period=7d", trends.fleet_activity);
  });

  sleep(0.3);

  group("reliability", () => {
    req("/api/analytics/reliability?period=7d", trends.reliability);
    sleep(0.2);
    req("/api/analytics/reliability?period=30d", trends.reliability);
  });

  sleep(0.3);

  group("cancellations", () => {
    req("/api/analytics/cancellations?period=7d", trends.cancellations);
  });

  sleep(0.3);

  group("line", () => {
    req("/api/analytics/line?route=205&view=summary&period=7d", trends.line);
    sleep(0.2);
    req("/api/analytics/line?route=205&view=summary&period=today", trends.line);
  });

  sleep(0.3);

  group("segment-speeds", () => {
    req("/api/analytics/segment-speeds?period=today", trends.segment_speeds);
    sleep(0.2);
    req("/api/analytics/segment-speeds?period=7d", trends.segment_speeds);
  });

  sleep(0.3);

  group("stop-headways", () => {
    req("/api/analytics/stop-headways?route=205&direction=0&period=7d", trends.stop_headways);
  });

  sleep(0.3);

  group("vehicle", () => {
    req("/api/analytics/vehicle?period=today", trends.vehicle);
  });

  sleep(0.5);
}
