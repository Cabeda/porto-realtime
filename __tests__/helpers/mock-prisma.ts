import { vi } from "vitest";

// Mock Prisma client for testing
export const mockPrisma = {
  user: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
  feedback: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    groupBy: vi.fn(),
    create: vi.fn(),
  },
  session: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  magicLink: {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

// Mock the @/lib/prisma module
vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Mock auth functions used by the feedback route.
// Default: no session (unauthenticated), resolveUserId falls back to anonymous ID.
export const mockGetSessionUser = vi.fn().mockResolvedValue(null);
export const mockResolveUserId = vi.fn().mockImplementation(async (request: Request) => {
  const anonId = request.headers.get("x-anonymous-id");
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (anonId && UUID_REGEX.test(anonId)) {
    const result = await mockPrisma.user.upsert({ where: { anonId }, update: {}, create: { anonId } });
    if (result?.id) {
      return { userId: result.id, isAuthenticated: false };
    }
    return { userId: "mock-user-id", isAuthenticated: false };
  }
  return null;
});

vi.mock("@/lib/auth", () => ({
  getSessionUser: mockGetSessionUser,
  resolveUserId: mockResolveUserId,
}));

export function resetMocks() {
  Object.values(mockPrisma).forEach((model) => {
    Object.values(model).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    });
  });

  // Re-setup default auth mocks after reset
  mockGetSessionUser.mockReset().mockResolvedValue(null);
  mockResolveUserId.mockReset().mockImplementation(async (request: Request) => {
    const anonId = request.headers.get("x-anonymous-id");
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (anonId && UUID_REGEX.test(anonId)) {
      const result = await mockPrisma.user.upsert({ where: { anonId }, update: {}, create: { anonId } });
      if (result?.id) {
        return { userId: result.id, isAuthenticated: false };
      }
      return { userId: "mock-user-id", isAuthenticated: false };
    }
    return null;
  });
}
