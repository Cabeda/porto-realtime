import { describe, it, expect, vi } from "vitest";
import { validateOrigin, safeGetSession } from "@/lib/security";
import { NextRequest } from "next/server";

function makeRequest(headers: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/test");
  const req = new NextRequest(url, {
    method: "GET",
    headers,
  });
  return req;
}

describe("validateOrigin", () => {
  it("allows requests with no origin or referer", () => {
    const req = makeRequest({ host: "localhost:3000" });
    expect(validateOrigin(req)).toBeNull();
  });

  it("allows requests where origin matches host", () => {
    const req = makeRequest({
      host: "localhost:3000",
      origin: "http://localhost:3000",
    });
    expect(validateOrigin(req)).toBeNull();
  });

  it("rejects requests where origin does not match host", () => {
    const req = makeRequest({
      host: "localhost:3000",
      origin: "http://evil.com",
    });
    const result = validateOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("allows requests where referer matches host (no origin)", () => {
    const req = makeRequest({
      host: "localhost:3000",
      referer: "http://localhost:3000/page",
    });
    expect(validateOrigin(req)).toBeNull();
  });

  it("rejects requests where referer does not match host", () => {
    const req = makeRequest({
      host: "localhost:3000",
      referer: "http://evil.com/page",
    });
    const result = validateOrigin(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("rejects requests with invalid origin URL", () => {
    const req = makeRequest({
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
