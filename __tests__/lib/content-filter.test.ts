import { describe, it, expect } from "vitest";
import { checkComment } from "@/lib/content-filter";

describe("checkComment", () => {
  it("accepts clean comments", () => {
    expect(checkComment("Great bus service!")).toEqual({ clean: true });
    expect(checkComment("The stop is well maintained")).toEqual({ clean: true });
    expect(checkComment("Bom serviço")).toEqual({ clean: true });
  });

  it("accepts empty or whitespace-only input", () => {
    expect(checkComment("")).toEqual({ clean: true });
    expect(checkComment("   ")).toEqual({ clean: true });
  });

  it("blocks Portuguese profanity", () => {
    const result = checkComment("Isto é uma merda");
    expect(result.clean).toBe(false);
  });

  it("blocks English profanity", () => {
    const result = checkComment("This is fucking terrible");
    expect(result.clean).toBe(false);
  });

  it("blocks obfuscated profanity", () => {
    const result = checkComment("f u c k this");
    expect(result.clean).toBe(false);
  });

  it("blocks spam patterns", () => {
    const result = checkComment("buy now and get free money");
    expect(result.clean).toBe(false);
  });

  it("blocks excessive caps (>70% uppercase in long text)", () => {
    const result = checkComment("THIS IS ALL CAPS TEXT HERE");
    expect(result.clean).toBe(false);
  });

  it("allows short uppercase text (<=10 chars)", () => {
    const result = checkComment("GREAT!");
    expect(result.clean).toBe(true);
  });

  it("blocks repetitive characters", () => {
    const result = checkComment("This is greaaaaaaaat");
    expect(result.clean).toBe(false);
  });

  it("blocks URLs", () => {
    const result = checkComment("Check out https://spam.com");
    expect(result.clean).toBe(false);

    const result2 = checkComment("Visit www.spam.com");
    expect(result2.clean).toBe(false);
  });

  it("blocks crypto/casino spam keywords", () => {
    expect(checkComment("invest in bitcoin now").clean).toBe(false);
    expect(checkComment("join our telegram group").clean).toBe(false);
    expect(checkComment("best casino deals").clean).toBe(false);
  });

  it("is case-insensitive for blocked words", () => {
    expect(checkComment("MERDA").clean).toBe(false);
    expect(checkComment("Fuck").clean).toBe(false);
  });
});
