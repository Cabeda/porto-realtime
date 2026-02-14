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
};

// Mock the @/lib/prisma module
vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

export function resetMocks() {
  Object.values(mockPrisma).forEach((model) => {
    Object.values(model).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    });
  });
}
