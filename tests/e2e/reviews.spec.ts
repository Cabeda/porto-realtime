import { test, expect } from "@playwright/test";

test.describe("Community / Reviews hub", () => {
  test("renders review type tab buttons after clicking Reviews section", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("main", { timeout: 10000 });

    // Click the top-level "Reviews" section button first
    await page.getByRole("button", { name: /Reviews/i }).click();

    // Review type tabs should now be visible
    await expect(page.locator("button").filter({ hasText: "🚌" }).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("button").filter({ hasText: "🚏" }).first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator("button").filter({ hasText: "🚍" }).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("switching review type tabs works", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("main", { timeout: 10000 });

    await page.getByRole("button", { name: /Reviews/i }).click();

    const stopTab = page.locator("button").filter({ hasText: "🚏" }).first();
    await expect(stopTab).toBeVisible({ timeout: 5000 });
    await stopTab.click();
    // After clicking, the button should have the active style
    await expect(stopTab).toHaveClass(/bg-white|bg-gray-600/, { timeout: 8000 });
  });

  test("/reviews redirects to /community", async ({ page }) => {
    await page.goto("/reviews");
    await page.waitForURL(/\/community/, { timeout: 5000 });
  });
});

test.describe("Line reviews page", () => {
  test("shows message when no line id provided", async ({ page }) => {
    await page.goto("/reviews/line");
    await page.waitForSelector("main, .min-h-screen", { timeout: 10000 });
    // Without ?id= param the page renders a fallback message
    await expect(page.locator("main, .min-h-screen").first()).toBeVisible();
  });

  test("renders line review page with rate button for a known line", async ({ page }) => {
    await page.goto("/reviews/line?id=200");
    await page.waitForSelector("header", { timeout: 10000 });

    // Header should show line number
    await expect(page.locator("h1").filter({ hasText: /200/ })).toBeVisible({ timeout: 10000 });

    // Rate button should be present
    await expect(page.getByRole("button", { name: /rate/i })).toBeVisible({ timeout: 5000 });
  });

  test("back link navigates to community page", async ({ page }) => {
    await page.goto("/reviews/line?id=200");
    await page.waitForSelector("header", { timeout: 10000 });

    await page.locator("a[href='/community']").first().click();
    await page.waitForURL(/\/community/, { timeout: 5000 });
  });
});

test.describe("Stop reviews page", () => {
  test("renders stop review page for Bolhão", async ({ page }) => {
    await page.goto("/reviews/stop?id=2:BLM");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.locator("main")).toBeVisible();
  });
});

test.describe("Vehicle reviews page", () => {
  test("renders vehicle review page", async ({ page }) => {
    await page.goto("/reviews/vehicle?id=3245");
    await page.waitForSelector("main, .min-h-screen", { timeout: 10000 });
    await expect(page.locator("main, .min-h-screen").first()).toBeVisible();
  });
});

test.describe("Bike park reviews page", () => {
  test("renders bike park review page", async ({ page }) => {
    await page.goto("/reviews/bike-park");
    await page.waitForSelector("main, .min-h-screen", { timeout: 10000 });
    await expect(page.locator("main, .min-h-screen").first()).toBeVisible();
  });
});

test.describe("Bike lane reviews page", () => {
  test("renders bike lane review page", async ({ page }) => {
    await page.goto("/reviews/bike-lane");
    await page.waitForSelector("main, .min-h-screen", { timeout: 10000 });
    await expect(page.locator("main, .min-h-screen").first()).toBeVisible();
  });
});
