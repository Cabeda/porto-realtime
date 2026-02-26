import { describe, it, expect } from "vitest";
import {
  getEscalationTier,
  buildComplaintContext,
  TIER2_THRESHOLD,
  TIER3_THRESHOLD,
  PORTAL_QUEIXA_URL,
  LIVRO_RECLAMACOES_URL,
} from "@/lib/escalation";

describe("getEscalationTier", () => {
  it("returns null below tier 2 threshold", () => {
    expect(getEscalationTier(0)).toBeNull();
    expect(getEscalationTier(24)).toBeNull();
  });

  it("returns tier 2 at exactly the threshold", () => {
    expect(getEscalationTier(TIER2_THRESHOLD)).toBe(2);
  });

  it("returns tier 2 between thresholds", () => {
    expect(getEscalationTier(30)).toBe(2);
    expect(getEscalationTier(49)).toBe(2);
  });

  it("returns tier 3 at exactly the threshold", () => {
    expect(getEscalationTier(TIER3_THRESHOLD)).toBe(3);
  });

  it("returns tier 3 above threshold", () => {
    expect(getEscalationTier(100)).toBe(3);
    expect(getEscalationTier(999)).toBe(3);
  });
});

describe("constants", () => {
  it("has correct threshold values", () => {
    expect(TIER2_THRESHOLD).toBe(25);
    expect(TIER3_THRESHOLD).toBe(50);
  });

  it("exports valid URLs", () => {
    expect(PORTAL_QUEIXA_URL).toContain("portaldaqueixa.com");
    expect(LIVRO_RECLAMACOES_URL).toContain("livroreclamacoes.pt");
  });
});

describe("buildComplaintContext", () => {
  const baseOpts = {
    type: "LINE",
    targetId: "701",
    rating: 2,
    comment: "Always late",
    tags: ["delays", "overcrowding"],
    voteCount: 30,
    createdAt: "2024-06-15T10:00:00Z",
  };

  it("includes type label for LINE", () => {
    const result = buildComplaintContext(baseOpts);
    expect(result).toContain("Line 701");
  });

  it("includes type label for STOP", () => {
    const result = buildComplaintContext({ ...baseOpts, type: "STOP", targetId: "BRRS2" });
    expect(result).toContain("Stop BRRS2");
  });

  it("includes type label for VEHICLE", () => {
    const result = buildComplaintContext({ ...baseOpts, type: "VEHICLE", targetId: "3456" });
    expect(result).toContain("Vehicle 3456");
  });

  it("includes type label for BIKE_PARK", () => {
    const result = buildComplaintContext({ ...baseOpts, type: "BIKE_PARK", targetId: "bp-1" });
    expect(result).toContain("Bike park bp-1");
  });

  it("includes type label for BIKE_LANE", () => {
    const result = buildComplaintContext({ ...baseOpts, type: "BIKE_LANE", targetId: "bl-1" });
    expect(result).toContain("Bike lane bl-1");
  });

  it("includes rating", () => {
    const result = buildComplaintContext(baseOpts);
    expect(result).toContain("Rating: 2/5");
  });

  it("includes tags", () => {
    const result = buildComplaintContext(baseOpts);
    expect(result).toContain("delays, overcrowding");
  });

  it("includes comment in quotes", () => {
    const result = buildComplaintContext(baseOpts);
    expect(result).toContain('"Always late"');
  });

  it("includes vote count", () => {
    const result = buildComplaintContext(baseOpts);
    expect(result).toContain("30 community members");
  });

  it("includes PortoMove attribution", () => {
    const result = buildComplaintContext(baseOpts);
    expect(result).toContain("portomove.pt");
  });

  it("omits tags section when empty", () => {
    const result = buildComplaintContext({ ...baseOpts, tags: [] });
    expect(result).not.toContain("Issues reported:");
  });

  it("omits comment when null", () => {
    const result = buildComplaintContext({ ...baseOpts, comment: null });
    // Should not have empty quotes
    expect(result).not.toContain('""');
  });
});
