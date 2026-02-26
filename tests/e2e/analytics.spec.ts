import { test, expect } from "@playwright/test";

test.describe("Analytics page", () => {
  test("renders analytics page with main content", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.locator(".min-h-screen").first()).toBeVisible();
  });

  test("has navigation links in header", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("header", { timeout: 10000 });

    await expect(page.locator("header a[href='/stations']")).toBeVisible();
    await expect(page.locator("header a[href='/community']")).toBeVisible();
  });

  test("analytics sub-pages are accessible", async ({ page }) => {
    await page.goto("/analytics/line?route=200");
    await page.waitForSelector("header, .min-h-screen", { timeout: 10000 });
    await expect(page.locator(".min-h-screen").first()).toBeVisible();
  });
});
