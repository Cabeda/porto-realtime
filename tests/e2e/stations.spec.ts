import { test, expect } from "@playwright/test";

test.describe("Stations page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/stations");
    await page.waitForSelector("header", { timeout: 10000 });
  });

  test("renders page with search and favorites section", async ({ page }) => {
    await expect(page.getByPlaceholder("Search stops by name...")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Favorites/i })).toBeVisible();
  });

  test("search input filters stations", async ({ page }) => {
    const search = page.getByPlaceholder("Search stops by name...");
    await expect(search).toBeVisible({ timeout: 10000 });
    // Type 2+ chars to trigger search results
    await search.fill("Bolhão");
    await expect(page.locator("text=/Bolhão/i").first()).toBeVisible({ timeout: 10000 });
  });

  test("search results contain station links", async ({ page }) => {
    const search = page.getByPlaceholder("Search stops by name...");
    await search.fill("Bolhão");
    // Wait for results section
    await expect(page.locator("text=/Results/i").first()).toBeVisible({ timeout: 10000 });
    // Station links should appear
    const stationLinks = page.locator("a[href*='station?gtfsId']");
    await expect(stationLinks.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking a search result navigates to station detail", async ({ page }) => {
    const search = page.getByPlaceholder("Search stops by name...");
    await search.fill("Bolhão");
    const stationLink = page.locator("a[href*='station?gtfsId']").first();
    await expect(stationLink).toBeVisible({ timeout: 10000 });
    await stationLink.click();
    await expect(page).toHaveURL(/\/station\?gtfsId=/, { timeout: 5000 });
  });
});

test.describe("Station detail page", () => {
  test("shows station name for Bolhão", async ({ page }) => {
    await page.goto("/station?gtfsId=2:BLM");
    await expect(page.locator("text=/Bolhão/i").first()).toBeVisible({ timeout: 15000 });
  });

  test("shows departure times", async ({ page }) => {
    await page.goto("/station?gtfsId=2:BLM");
    // Departure times show as "Xm", "Xh", or "HH:MM"
    await expect(page.locator("text=/\\d+\\s*min|\\d+h|\\d{1,2}:\\d{2}/").first()).toBeVisible({
      timeout: 15000,
    });
  });
});
