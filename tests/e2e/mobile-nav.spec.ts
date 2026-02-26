import { test, expect } from "@playwright/test";

test.describe("Mobile bottom nav", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("onboarding-completed", "true");
    });
  });

  test("bottom nav is visible on mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav", { timeout: 10000 });
    await expect(page.locator("nav").filter({ hasText: "🗺️" })).toBeVisible();
  });

  test("bottom nav navigates to stations", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav", { timeout: 10000 });

    await page.locator("nav a[href='/stations']").click();
    await page.waitForURL(/\/stations/, { timeout: 10000 });
  });

  test("bottom nav navigates to analytics", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav", { timeout: 10000 });

    await page.locator("nav a[href='/analytics']").click();
    await page.waitForURL(/\/analytics/, { timeout: 10000 });
  });

  test("bottom nav navigates to community", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav", { timeout: 10000 });

    await page.locator("nav a[href='/community']").click();
    await page.waitForURL(/\/community/, { timeout: 10000 });
  });

  test("bottom nav navigates back to map", async ({ page }) => {
    await page.goto("/stations");
    await page.waitForSelector("nav", { timeout: 10000 });

    await page.locator("nav a[href='/']").click();
    await page.waitForURL(/\/$/, { timeout: 10000 });
  });
});
