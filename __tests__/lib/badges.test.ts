import { describe, it, expect } from "vitest";
import { computeBadgesFromStats } from "@/lib/badges";

describe("computeBadgesFromStats", () => {
  it("returns empty array for zero stats", () => {
    const badges = computeBadgesFromStats({
      reviewCount: 0,
      totalVotesReceived: 0,
      uniqueTargets: 0,
    });
    expect(badges).toEqual([]);
  });

  it("awards FIRST_REVIEW for 1+ reviews", () => {
    const badges = computeBadgesFromStats({
      reviewCount: 1,
      totalVotesReceived: 0,
      uniqueTargets: 1,
    });
    expect(badges).toContain("FIRST_REVIEW");
    expect(badges).not.toContain("TRANSIT_VOICE");
  });

  it("awards TRANSIT_VOICE for 10+ reviews", () => {
    const badges = computeBadgesFromStats({
      reviewCount: 10,
      totalVotesReceived: 0,
      uniqueTargets: 5,
    });
    expect(badges).toContain("FIRST_REVIEW");
    expect(badges).toContain("TRANSIT_VOICE");
    expect(badges).not.toContain("COMMUNITY_CHAMPION");
  });

  it("awards COMMUNITY_CHAMPION for 100+ reviews", () => {
    const badges = computeBadgesFromStats({
      reviewCount: 100,
      totalVotesReceived: 0,
      uniqueTargets: 5,
    });
    expect(badges).toContain("COMMUNITY_CHAMPION");
    expect(badges).toContain("TRANSIT_VOICE");
    expect(badges).toContain("FIRST_REVIEW");
  });

  it("awards HELPFUL_REVIEWER for 50+ votes received", () => {
    const badges = computeBadgesFromStats({
      reviewCount: 5,
      totalVotesReceived: 50,
      uniqueTargets: 3,
    });
    expect(badges).toContain("HELPFUL_REVIEWER");
    expect(badges).toContain("FIRST_REVIEW");
  });

  it("awards NETWORK_EXPLORER for 10+ unique targets", () => {
    const badges = computeBadgesFromStats({
      reviewCount: 10,
      totalVotesReceived: 0,
      uniqueTargets: 10,
    });
    expect(badges).toContain("NETWORK_EXPLORER");
  });

  it("awards all badges when all thresholds met", () => {
    const badges = computeBadgesFromStats({
      reviewCount: 100,
      totalVotesReceived: 50,
      uniqueTargets: 10,
    });
    expect(badges).toHaveLength(5);
    expect(badges).toEqual([
      "FIRST_REVIEW",
      "TRANSIT_VOICE",
      "COMMUNITY_CHAMPION",
      "HELPFUL_REVIEWER",
      "NETWORK_EXPLORER",
    ]);
  });

  it("does not award HELPFUL_REVIEWER below threshold", () => {
    const badges = computeBadgesFromStats({
      reviewCount: 5,
      totalVotesReceived: 49,
      uniqueTargets: 3,
    });
    expect(badges).not.toContain("HELPFUL_REVIEWER");
  });

  it("does not award NETWORK_EXPLORER below threshold", () => {
    const badges = computeBadgesFromStats({
      reviewCount: 5,
      totalVotesReceived: 0,
      uniqueTargets: 9,
    });
    expect(badges).not.toContain("NETWORK_EXPLORER");
  });
});
