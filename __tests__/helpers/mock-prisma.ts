import { vi } from "vitest";

// Mock Prisma client for testing
export const mockPrisma = {
  user: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  feedback: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    groupBy: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

// Mock the @/lib/prisma module
vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// Mock Neon Auth server — default: no session (unauthenticated)
export const mockGetSession = vi.fn().mockResolvedValue({ data: null });

vi.mock("@/lib/auth", () => ({
  auth: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
    handler: () => ({
      GET: vi.fn(),
      POST: vi.fn(),
      PUT: vi.fn(),
      DELETE: vi.fn(),
      PATCH: vi.fn(),
    }),
  },
}));

export function resetMocks() {
  Object.values(mockPrisma).forEach((model) => {
    Object.values(model).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    });
  });

  // Re-setup default auth mock after reset
  mockGetSession.mockReset().mockResolvedValue({ data: null });
}
