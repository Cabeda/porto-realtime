import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises before importing the module
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
}));

import { readFallback } from "@/lib/fallback";
import { readFile } from "fs/promises";

const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  mockReadFile.mockReset();
});

describe("readFallback", () => {
  it("returns parsed JSON when file exists", async () => {
    const data = { buses: [{ id: "bus-1" }] };
    mockReadFile.mockResolvedValue(JSON.stringify(data));

    const result = await readFallback<typeof data>("buses.json");
    expect(result).toEqual(data);
  });

  it("passes correct file path", async () => {
    mockReadFile.mockResolvedValue("{}");

    await readFallback("stations.json");
    const callPath = mockReadFile.mock.calls[0]![0] as string;
    expect(callPath).toContain("public");
    expect(callPath).toContain("fallback");
    expect(callPath).toContain("stations.json");
  });

  it("returns null when file does not exist", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

    const result = await readFallback("missing.json");
    expect(result).toBeNull();
  });

  it("returns null when file contains invalid JSON", async () => {
    mockReadFile.mockResolvedValue("not valid json {{{");

    const result = await readFallback("bad.json");
    expect(result).toBeNull();
  });
});
