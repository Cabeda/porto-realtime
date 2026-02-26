import { test, expect } from "@playwright/test";

test.describe("Analytics sub-pages", () => {
  test("about/methodology page renders", async ({ page }) => {
    await page.goto("/analytics/about");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Methodology" })).toBeVisible();
  });

  test("data export page renders", async ({ page }) => {
    await page.goto("/analytics/data");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Download Data" })).toBeVisible();
  });

  test("heatmap page renders", async ({ page }) => {
    await page.goto("/analytics/heatmap");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Velocity Heatmap" })).toBeVisible();
  });

  test("history replay page renders", async ({ page }) => {
    await page.goto("/analytics/history");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "History Replay" })).toBeVisible();
  });

  test("reliability page renders", async ({ page }) => {
    await page.goto("/analytics/reliability");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Service Reliability" })).toBeVisible();
  });

  test("vehicle analytics page renders", async ({ page }) => {
    await page.goto("/analytics/vehicle");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Vehicle Analytics" })).toBeVisible();
  });

  test("line analytics page renders with route param", async ({ page }) => {
    await page.goto("/analytics/line?route=200");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.locator(".min-h-screen").first()).toBeVisible();
  });

  test("analytics index has links to sub-pages", async ({ page }) => {
    await page.goto("/analytics");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.locator("a[href='/analytics/reliability']")).toBeVisible();
    await expect(page.locator("a[href='/analytics/heatmap']")).toBeVisible();
  });
});
