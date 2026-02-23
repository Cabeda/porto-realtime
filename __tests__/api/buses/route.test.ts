import { describe, it, expect } from "vitest";
import { parseAnnotations, buildRouteDestinationMap } from "@/app/api/buses/route";

describe("parseAnnotations", () => {
  it("converts STCP 1-indexed sentido to 0-indexed OTP directionId", () => {
    const result = parseAnnotations(["stcp:sentido:1", "stcp:nr_viagem:12345"]);
    expect(result.directionId).toBe(0);
    expect(result.tripId).toBe("12345");
  });

  it("converts sentido:2 to directionId 1", () => {
    const result = parseAnnotations(["stcp:sentido:2"]);
    expect(result.directionId).toBe(1);
  });

  it("returns null directionId when no sentido annotation", () => {
    const result = parseAnnotations(["stcp:nr_viagem:99"]);
    expect(result.directionId).toBeNull();
    expect(result.tripId).toBe("99");
  });

  it("returns defaults for empty annotations", () => {
    const result = parseAnnotations([]);
    expect(result.directionId).toBeNull();
    expect(result.tripId).toBe("");
  });

  it("returns defaults for undefined annotations", () => {
    const result = parseAnnotations(undefined);
    expect(result.directionId).toBeNull();
    expect(result.tripId).toBe("");
  });
});

describe("buildRouteDestinationMap", () => {
  const routes = [
    {
      gtfsId: "1:701",
      shortName: "701",
      longName: "Bolhão - Codiceira",
      patterns: [
        { headsign: "Codiceira", directionId: 1 },
        { headsign: "Bolhão", directionId: 0 },
      ],
    },
  ];

  it("does not include longName as a destination", () => {
    const map = buildRouteDestinationMap(routes);
    const entry = map.get("701")!;
    expect(entry.destinations).not.toContain("Bolhão - Codiceira");
  });

  it("maps direction 0 to correct headsign", () => {
    const map = buildRouteDestinationMap(routes);
    const entry = map.get("701")!;
    expect(entry.directionHeadsigns.get(0)).toEqual(["Bolhão"]);
  });

  it("maps direction 1 to correct headsign", () => {
    const map = buildRouteDestinationMap(routes);
    const entry = map.get("701")!;
    expect(entry.directionHeadsigns.get(1)).toEqual(["Codiceira"]);
  });
});
