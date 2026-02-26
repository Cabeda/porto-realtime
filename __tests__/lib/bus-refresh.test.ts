import { describe, it, expect } from "vitest";
import { msUntilNextBurst, BURST_TARGET_SECOND } from "@/lib/bus-refresh";

// Helper: build a timestamp at a specific second within the current minute
function atSecond(sec: number, ms = 0): number {
  const d = new Date();
  d.setSeconds(sec, ms);
  return d.getTime();
}

describe("msUntilNextBurst", () => {
  it("returns ~(target - current) seconds when before the target", () => {
    const now = atSecond(10, 0); // :10.000
    const delay = msUntilNextBurst(now);
    const expected = (BURST_TARGET_SECOND - 10) * 1000; // 20 000ms
    expect(delay).toBeCloseTo(expected, -2); // within 100ms
  });

  it("returns ~(60 - current + target) seconds when past the target", () => {
    const now = atSecond(45, 0); // :45.000 — already past :30
    const delay = msUntilNextBurst(now);
    const expected = (60 - 45 + BURST_TARGET_SECOND) * 1000; // 45 000ms
    expect(delay).toBeCloseTo(expected, -2);
  });

  it("accounts for milliseconds within the current second", () => {
    const now = atSecond(10, 500); // :10.500
    const delay = msUntilNextBurst(now);
    const expected = (BURST_TARGET_SECOND - 10) * 1000 - 500; // 19 500ms
    expect(delay).toBeCloseTo(expected, -2);
  });

  it("never returns less than minDelayMs", () => {
    // Exactly at the target second — delay would be 0 without the floor
    const now = atSecond(BURST_TARGET_SECOND, 0);
    const delay = msUntilNextBurst(now, 1000);
    expect(delay).toBeGreaterThanOrEqual(1000);
  });

  it("returns a value in the range (1s, 61s)", () => {
    // Should always be within one minute
    for (let sec = 0; sec < 60; sec++) {
      const delay = msUntilNextBurst(atSecond(sec, 0));
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(61_000);
    }
  });

  it("targets second :30 (2s after the :28 burst end)", () => {
    expect(BURST_TARGET_SECOND).toBe(30);
  });
});
