import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Use vi.hoisted so these are available when vi.mock factories run
const { mockCookieStore, mockJwtVerify, mockPrisma } = vi.hoisted(() => {
  const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
  };

  const mockJwtVerify = vi.fn();

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    magicLink: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    feedback: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  return { mockCookieStore, mockJwtVerify, mockPrisma };
});

// Mock next/headers cookies
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}));

// Mock Resend
vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = {
        send: vi.fn().mockResolvedValue({ error: null }),
      };
    },
  };
});

// Mock jose
vi.mock("jose", () => {
  return {
    SignJWT: class MockSignJWT {
      setProtectedHeader() { return this; }
      setIssuedAt() { return this; }
      setExpirationTime() { return this; }
      async sign() { return "mock-jwt-token"; }
    },
    jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
  };
});

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Set env vars for tests
process.env.JWT_SECRET = "test-secret-at-least-32-characters-long";
process.env.RESEND_API_KEY = "re_test_key";

// Import after mocks
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as verifyPost } from "@/app/api/auth/verify/route";
import { POST as logoutPost } from "@/app/api/auth/logout/route";
import { GET as meGet } from "@/app/api/auth/me/route";

function makeRequest(
  url: string,
  options?: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> }
) {
  const { method = "GET", body, headers = {} } = options || {};
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function resetAllMocks() {
  Object.values(mockPrisma).forEach((model) => {
    if (typeof model === "function") {
      (model as ReturnType<typeof vi.fn>).mockReset();
      return;
    }
    Object.values(model).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    });
  });
  mockPrisma.$transaction.mockImplementation(
    (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
  );
  mockCookieStore.get.mockReset();
  mockCookieStore.set.mockReset();
  mockJwtVerify.mockReset();
}

describe("POST /api/auth/login", () => {
  beforeEach(() => resetAllMocks());

  it("returns 400 when email is missing", async () => {
    const req = makeRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: {},
    });
    const res = await loginPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("email");
  });

  it("returns 400 for invalid email format", async () => {
    const req = makeRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: { email: "not-an-email" },
    });
    const res = await loginPost(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for email exceeding 254 chars", async () => {
    const longEmail = "a".repeat(250) + "@b.com";
    const req = makeRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: { email: longEmail },
    });
    const res = await loginPost(req);
    expect(res.status).toBe(400);
  });

  it("returns success for valid email", async () => {
    mockPrisma.magicLink.count.mockResolvedValue(0);
    mockPrisma.magicLink.create.mockResolvedValue({ id: "ml1" });

    const req = makeRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: { email: "test@example.com" },
    });
    const res = await loginPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("returns 429 when rate limited", async () => {
    mockPrisma.magicLink.count.mockResolvedValue(3); // at limit

    const req = makeRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: { email: "test@example.com" },
    });
    const res = await loginPost(req);
    expect(res.status).toBe(429);
  });

  it("normalizes email to lowercase", async () => {
    mockPrisma.magicLink.count.mockResolvedValue(0);
    mockPrisma.magicLink.create.mockResolvedValue({ id: "ml1" });

    const req = makeRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: { email: "Test@Example.COM" },
    });
    const res = await loginPost(req);
    expect(res.status).toBe(200);

    // Verify the magic link was created with lowercase email
    expect(mockPrisma.magicLink.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: "test@example.com",
        }),
      })
    );
  });
});

describe("POST /api/auth/verify", () => {
  beforeEach(() => resetAllMocks());

  it("returns 400 when email is missing", async () => {
    const req = makeRequest("http://localhost:3000/api/auth/verify", {
      method: "POST",
      body: { code: "123456" },
    });
    const res = await verifyPost(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is missing", async () => {
    const req = makeRequest("http://localhost:3000/api/auth/verify", {
      method: "POST",
      body: { email: "test@example.com" },
    });
    const res = await verifyPost(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-6-digit code", async () => {
    const req = makeRequest("http://localhost:3000/api/auth/verify", {
      method: "POST",
      body: { email: "test@example.com", code: "12345" },
    });
    const res = await verifyPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("6 digits");
  });

  it("returns 400 for non-numeric code", async () => {
    const req = makeRequest("http://localhost:3000/api/auth/verify", {
      method: "POST",
      body: { email: "test@example.com", code: "abcdef" },
    });
    const res = await verifyPost(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 for invalid/expired code", async () => {
    mockPrisma.magicLink.findFirst.mockResolvedValue(null);

    const req = makeRequest("http://localhost:3000/api/auth/verify", {
      method: "POST",
      body: { email: "test@example.com", code: "123456" },
    });
    const res = await verifyPost(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Invalid or expired");
  });

  it("returns user on successful verification (new user)", async () => {
    const futureDate = new Date(Date.now() + 600000);
    mockPrisma.magicLink.findFirst.mockResolvedValue({
      id: "ml1",
      email: "test@example.com",
      code: "123456",
      expiresAt: futureDate,
      usedAt: null,
    });
    mockPrisma.magicLink.update.mockResolvedValue({});
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: "user1",
      email: "test@example.com",
      role: "USER",
      emailVerified: new Date(),
    });
    mockPrisma.session.create.mockResolvedValue({
      id: "session1",
      userId: "user1",
      expiresAt: futureDate,
    });

    const req = makeRequest("http://localhost:3000/api/auth/verify", {
      method: "POST",
      body: { email: "test@example.com", code: "123456" },
    });
    const res = await verifyPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe("test@example.com");
    expect(data.user.role).toBe("USER");
  });

  it("links anonymous reviews when anonId is provided", async () => {
    const futureDate = new Date(Date.now() + 600000);
    mockPrisma.magicLink.findFirst.mockResolvedValue({
      id: "ml1",
      email: "test@example.com",
      code: "123456",
      expiresAt: futureDate,
      usedAt: null,
    });
    mockPrisma.magicLink.update.mockResolvedValue({});

    // No existing user with this email, but anonymous user exists
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null) // findUnique by email
      .mockResolvedValueOnce({     // findUnique by anonId
        id: "anon-user",
        anonId: "550e8400-e29b-41d4-a716-446655440000",
        email: null,
      });

    mockPrisma.user.update.mockResolvedValue({
      id: "anon-user",
      email: "test@example.com",
      role: "USER",
      emailVerified: new Date(),
    });

    mockPrisma.session.create.mockResolvedValue({
      id: "session1",
      userId: "anon-user",
      expiresAt: futureDate,
    });

    const req = makeRequest("http://localhost:3000/api/auth/verify", {
      method: "POST",
      body: {
        email: "test@example.com",
        code: "123456",
        anonId: "550e8400-e29b-41d4-a716-446655440000",
      },
    });
    const res = await verifyPost(req);
    expect(res.status).toBe(200);

    // Verify the anonymous user was upgraded (not a new user created)
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "anon-user" },
        data: expect.objectContaining({
          email: "test@example.com",
        }),
      })
    );
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(() => resetAllMocks());

  it("returns null user when no session cookie", async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const res = await meGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeNull();
  });

  it("returns null user when JWT is invalid", async () => {
    mockCookieStore.get.mockReturnValue({ value: "invalid-token" });
    mockJwtVerify.mockRejectedValue(new Error("Invalid token"));

    const res = await meGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeNull();
  });

  it("returns null user when session is expired", async () => {
    mockCookieStore.get.mockReturnValue({ value: "valid-token" });
    mockJwtVerify.mockResolvedValue({
      payload: { sessionId: "session1", userId: "user1" },
    });
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "session1",
      userId: "user1",
      expiresAt: new Date(Date.now() - 1000), // expired
      user: { id: "user1", email: "test@example.com", role: "USER" },
    });

    const res = await meGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeNull();
  });

  it("returns user when session is valid", async () => {
    mockCookieStore.get.mockReturnValue({ value: "valid-token" });
    mockJwtVerify.mockResolvedValue({
      payload: { sessionId: "session1", userId: "user1" },
    });
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "session1",
      userId: "user1",
      expiresAt: new Date(Date.now() + 86400000), // valid
      user: { id: "user1", email: "test@example.com", role: "USER" },
    });

    const res = await meGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toEqual({
      id: "user1",
      email: "test@example.com",
      role: "USER",
    });
  });
});

describe("POST /api/auth/logout", () => {
  beforeEach(() => resetAllMocks());

  it("returns success even when no session exists", async () => {
    mockCookieStore.get.mockReturnValue(undefined);

    const res = await logoutPost();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("clears session cookie and deletes session from DB", async () => {
    mockCookieStore.get.mockReturnValue({ value: "valid-token" });
    mockJwtVerify.mockResolvedValue({
      payload: { sessionId: "session1", userId: "user1" },
    });
    mockPrisma.session.delete.mockResolvedValue({});

    const res = await logoutPost();
    expect(res.status).toBe(200);

    // Verify session was deleted from DB
    expect(mockPrisma.session.delete).toHaveBeenCalledWith({
      where: { id: "session1" },
    });

    // Verify cookie was cleared (set with maxAge: 0)
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "portomove-session",
      "",
      expect.objectContaining({ maxAge: 0 })
    );
  });
});
