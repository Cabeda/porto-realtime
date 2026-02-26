import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/e2e/mobile-nav.spec.ts"],
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      // Only run tests that don't rely on desktop-only UI (hidden nav, layer chips, etc.)
      testMatch: [
        "**/e2e/reviews.spec.ts",
        "**/e2e/stations.spec.ts",
        "**/e2e/mobile-nav.spec.ts",
        "**/e2e/onboarding.spec.ts",
      ],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
