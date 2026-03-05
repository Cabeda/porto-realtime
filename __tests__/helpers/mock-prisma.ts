import { vi } from "vitest";

// Mock KeyedStaleCache so module-level caches in route handlers never return
// stale data between tests. The real class lives in @/lib/api-fetch.
vi.mock("@/lib/api-fetch", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  class NoOpKeyedStaleCache<T> {
    get(_key: string): { data: T; fresh: boolean } | null {
      return null; // always miss — forces handler to use mocked Prisma
    }
    set(_key: string, _data: T): void {
      /* no-op */
    }
  }
  class NoOpStaleCache<T> {
    get(): { data: T; fresh: boolean } | null {
      return null;
    }
    set(_data: T): void {
      /* no-op */
    }
    hasData(): boolean {
      return false;
    }
  }
  return {
    ...actual,
    KeyedStaleCache: NoOpKeyedStaleCache,
    StaleCache: NoOpStaleCache,
  };
});

// Mock Prisma client for testing
export const mockPrisma = {
  user: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
  },
  feedback: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    groupBy: vi.fn(),
    create: vi.fn(),
  },
  feedbackVote: {
    upsert: vi.fn(),
    groupBy: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  report: {
    create: vi.fn(),
    count: vi.fn(),
  },
  checkIn: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  routePerformanceDaily: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
  tripLog: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
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
