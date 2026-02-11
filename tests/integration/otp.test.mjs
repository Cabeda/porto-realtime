// @ts-check
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const OTP_URL =
  "https://otp.portodigital.pt/otp/routers/default/index/graphql";
const HEADERS = {
  "Content-Type": "application/json",
  Origin: "https://explore.porto.pt",
};

/** @param {string} query @param {Record<string, unknown>} [variables] */
async function gql(query, variables) {
  const res = await fetch(OTP_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ query, variables }),
  });
  assert.equal(res.ok, true, `HTTP ${res.status}`);
  const json = await res.json();
  assert.ok(!json.errors?.length, json.errors ? JSON.stringify(json.errors) : "");
  return json.data;
}

describe("OTP endpoint (otp.portodigital.pt)", () => {
  describe("service availability", () => {
    it("should have a valid service time range covering today", async () => {
      const data = await gql("{ serviceTimeRange { start end } }");
      const now = Math.floor(Date.now() / 1000);
      assert.ok(data.serviceTimeRange.start < now, "Service should have started");
      assert.ok(data.serviceTimeRange.end > now, "Service should not have ended");
    });

    it("should have STCP and Metro feeds", async () => {
      const data = await gql("{ feeds { feedId agencies { name } } }");
      const names = data.feeds.flatMap((f) => f.agencies.map((a) => a.name));
      assert.ok(names.some((n) => /STCP|Transportes Colectivos/i.test(n)), "Missing STCP feed");
      assert.ok(names.some((n) => /Metro do Porto/i.test(n)), "Missing Metro feed");
    });
  });

  describe("stops", () => {
    it("should return stops with required fields", async () => {
      const data = await gql("{ stops { gtfsId name lat lon code } }");
      assert.ok(data.stops.length > 100, `Expected >100 stops, got ${data.stops.length}`);
      const stop = data.stops[0];
      assert.ok(stop.gtfsId, "Stop missing gtfsId");
      assert.ok(stop.name, "Stop missing name");
      assert.ok(typeof stop.lat === "number", "Stop missing lat");
      assert.ok(typeof stop.lon === "number", "Stop missing lon");
    });

    it("should find Bolhão stop by ID", async () => {
      const data = await gql(
        "query($id: String!) { stop(id: $id) { gtfsId name } }",
        { id: "2:BLM" }
      );
      assert.ok(data.stop, "Bolhão stop not found");
      assert.match(data.stop.name, /bolh/i);
    });
  });

  describe("departures (real-time)", () => {
    it("should return departures for a major stop", async () => {
      const now = Math.floor(Date.now() / 1000);
      const data = await gql(
        `query($id: String!, $start: Long!, $range: Int!, $n: Int!) {
          stop(id: $id) {
            name
            stoptimesWithoutPatterns(startTime: $start, timeRange: $range, numberOfDepartures: $n, omitCanceled: false) {
              realtimeState scheduledDeparture serviceDay realtime departureDelay
              trip { route { shortName longName } }
            }
          }
        }`,
        { id: "2:BLM", start: now, range: 3600, n: 10 }
      );
      const deps = data.stop.stoptimesWithoutPatterns;
      assert.ok(deps.length > 0, "No departures returned — GTFS data may be expired");
      const dep = deps[0];
      assert.ok(dep.scheduledDeparture > 0, "Missing scheduledDeparture");
      assert.ok(dep.serviceDay > 0, "Missing serviceDay");
      assert.ok(dep.trip.route.shortName, "Missing route shortName");
    });

    it("should include real-time updates", async () => {
      const now = Math.floor(Date.now() / 1000);
      const data = await gql(
        `query($id: String!, $start: Long!) {
          stop(id: $id) {
            stoptimesWithoutPatterns(startTime: $start, timeRange: 3600, numberOfDepartures: 20, omitCanceled: false) {
              realtimeState realtime
            }
          }
        }`,
        { id: "2:BLM", start: now }
      );
      const deps = data.stop.stoptimesWithoutPatterns;
      const hasRealtime = deps.some((d) => d.realtimeState === "UPDATED");
      assert.ok(hasRealtime, "Expected at least one real-time departure");
    });
  });

  describe("routes", () => {
    it("should return STCP bus routes", async () => {
      const data = await gql(
        '{ routes(feeds: ["2"]) { gtfsId shortName longName } }'
      );
      assert.ok(data.routes.length > 30, `Expected >30 routes, got ${data.routes.length}`);
      const route = data.routes[0];
      assert.ok(route.shortName, "Route missing shortName");
      assert.ok(route.longName, "Route missing longName");
    });
  });

  describe("route patterns (geometries)", () => {
    it("should return patterns with polyline geometry", async () => {
      const data = await gql(
        '{ routes(feeds: ["2"]) { shortName patterns { id headsign directionId patternGeometry { length points } } } }'
      );
      const withGeometry = data.routes.filter((r) =>
        r.patterns.some((p) => p.patternGeometry?.points)
      );
      assert.ok(
        withGeometry.length > 20,
        `Expected >20 routes with geometry, got ${withGeometry.length}`
      );
      const routeWithGeometry = withGeometry[0];
      const sample =
        routeWithGeometry.patterns.find((p) => p.patternGeometry?.points);
      assert.ok(sample, "Expected at least one pattern with geometry");
      assert.ok(sample.patternGeometry.points, "Missing encoded polyline");
      assert.ok(sample.patternGeometry.length > 0, "Polyline length should be > 0");
    });
  });
});
