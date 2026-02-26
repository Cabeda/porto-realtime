import { describe, it, expect } from "vitest";
import { unwrap, unwrapAnnotations, unwrapLocation } from "@/lib/schemas/fiware";

describe("unwrap", () => {
  it("returns undefined for null", () => {
    expect(unwrap(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(unwrap(undefined)).toBeUndefined();
  });

  it("unwraps { value: T } objects", () => {
    expect(unwrap({ value: "hello" })).toBe("hello");
    expect(unwrap({ value: 42 })).toBe(42);
  });

  it("returns flat values directly", () => {
    expect(unwrap("hello")).toBe("hello");
    expect(unwrap(42)).toBe(42);
  });

  it("handles zero correctly", () => {
    expect(unwrap(0)).toBe(0);
    expect(unwrap({ value: 0 })).toBe(0);
  });

  it("handles empty string correctly", () => {
    expect(unwrap("")).toBe("");
    expect(unwrap({ value: "" })).toBe("");
  });
});

describe("unwrapAnnotations", () => {
  it("returns undefined for null/undefined", () => {
    expect(unwrapAnnotations(null)).toBeUndefined();
    expect(unwrapAnnotations(undefined)).toBeUndefined();
  });

  it("returns array directly if already an array", () => {
    const arr = ["stcp:sentido:0", "stcp:nr_viagem:123"];
    expect(unwrapAnnotations(arr)).toEqual(arr);
  });

  it("unwraps { value: [...] } format", () => {
    const wrapped = { value: ["stcp:sentido:1"] };
    expect(unwrapAnnotations(wrapped)).toEqual(["stcp:sentido:1"]);
  });

  it("returns undefined for non-array values", () => {
    expect(unwrapAnnotations("not-an-array")).toBeUndefined();
    expect(unwrapAnnotations(42)).toBeUndefined();
  });

  it("returns undefined for empty falsy value", () => {
    expect(unwrapAnnotations(0)).toBeUndefined();
    expect(unwrapAnnotations("")).toBeUndefined();
  });
});

describe("unwrapLocation", () => {
  it("extracts coordinates from nested { value: { coordinates } } format", () => {
    const loc = {
      type: "geo:json",
      value: {
        type: "Point",
        coordinates: [-8.61, 41.15] as [number, number],
      },
    };
    expect(unwrapLocation(loc)).toEqual([-8.61, 41.15]);
  });

  it("extracts coordinates from flat { coordinates } format", () => {
    const loc = {
      type: "Point",
      coordinates: [-8.61, 41.15] as [number, number],
    };
    expect(unwrapLocation(loc)).toEqual([-8.61, 41.15]);
  });
});
