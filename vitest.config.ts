import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "lib/sanitize.ts",
        "lib/strings.ts",
        "lib/content-filter.ts",
        "lib/security.ts",
        "lib/badges.ts",
        "lib/api-fetch.ts",
        "lib/logger.ts",
        "lib/schemas/**/*.ts",
        "app/api/feedback/route.ts",
        "app/api/feedback/summary/route.ts",
        "app/api/feedback/rankings/route.ts",
        "app/api/buses/route.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 55,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
