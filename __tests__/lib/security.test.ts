import { describe, it, expect, vi } from "vitest";
import { validateOrigin, safeGetSession } from "@/lib/security";
import { NextRequest } from "next/server";

function makeRequest(method: string, headers: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/test");
  const req = new NextRequest(url, { method, headers });
  return req;
}

describe("validateOrigin", () => {
  // Safe methods — always allowed regardless of origin
  it("allows GET with no origin or referer", () => {
    expect(validateOrigin(makeRequest("GET", { host: "localhost:3000" }))).toBeNull();
  });

  it("allows HEAD with no origin or referer", () => {
    expect(validateOrigin(makeRequest("HEAD", { host: "localhost:3000" }))).toBeNull();
  });

  it("allows OPTIONS with no origin or referer", () => {
    expect(validateOrigin(makeRequest("OPTIONS", { host: "localhost:3000" }))).toBeNull();
  });

  // Mutating methods — require matching origin/referer
  it("rejects POST with no origin or referer", () => {
    const result = validateOrigin(makeRequest("POST", { host: "localhost:3000" }));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("rejects DELETE with no origin or referer", () => {
    const result = validateOrigin(makeRequest("DELETE", { host: "localhost:3000" }));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("allows POST where origin matches host", () => {
    const req = makeRequest("POST", {
      host: "localhost:3000",
      origin: "http://localhost:3000",
    });
    expect(validateOrigin(req)).toBeNull();
  });

  it("rejects POST where origin does not match host", () => {
    const req = makeRequest("POST", {
      host: "localhost:3000",
      origin: "http://evil.com",
    });
    const result = validateOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("allows POST where referer matches host (no origin)", () => {
    const req = makeRequest("POST", {
      host: "localhost:3000",
      referer: "http://localhost:3000/page",
    });
    expect(validateOrigin(req)).toBeNull();
  });

  it("rejects POST where referer does not match host", () => {
    const req = makeRequest("POST", {
      host: "localhost:3000",
      referer: "http://evil.com/page",
    });
    const result = validateOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("rejects POST with invalid origin URL", () => {
    const req = makeRequest("POST", {
      host: "localhost:3000",
      origin: "not-a-url",
    });
    const result = validateOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});

describe("safeGetSession", () => {
  it("returns user when session exists", async () => {
    const mockAuth = {
      getSession: vi.fn().mockResolvedValue({
        data: { user: { email: "test@example.com" } },
      }),
    };
    const result = await safeGetSession(mockAuth);
    expect(result).toEqual({ email: "test@example.com" });
  });

  it("returns null when session is null", async () => {
    const mockAuth = {
      getSession: vi.fn().mockResolvedValue({ data: null }),
    };
    const result = await safeGetSession(mockAuth);
    expect(result).toBeNull();
  });

  it("returns null when getSession throws", async () => {
    const mockAuth = {
      getSession: vi.fn().mockRejectedValue(new Error("No cookies")),
    };
    const result = await safeGetSession(mockAuth);
    expect(result).toBeNull();
  });

  it("returns null when session has no user", async () => {
    const mockAuth = {
      getSession: vi.fn().mockResolvedValue({ data: {} }),
    };
    const result = await safeGetSession(mockAuth);
    expect(result).toBeNull();
  });
});
