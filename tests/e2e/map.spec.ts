import { test, expect } from "@playwright/test";

test.describe("Map page", () => {
  test.beforeEach(async ({ page }) => {
    // Skip onboarding and pre-seed localStorage so the map renders immediately
    await page.addInitScript(() => {
      localStorage.setItem("onboarding-completed", "true");
    });
    await page.goto("/");
    await page.waitForSelector("header", { timeout: 10000 });
    await page.waitForSelector("main", { timeout: 10000 });
  });

  test("renders header with refresh button", async ({ page }) => {
    // Button title is "Click to refresh buses and location"
    const refreshBtn = page.getByRole("button", { name: /refresh/i });
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });
  });

  test("layer chips are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Stops/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Paths/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Parques/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ciclovias/i })).toBeVisible();
  });

  test("route filter panel opens and shows routes", async ({ page }) => {
    const filterBtn = page.getByRole("button", { name: /Filter lines/i });
    await expect(filterBtn).toBeVisible();
    await filterBtn.click();
    // Routes load from OTP — wait for any 3-digit route button
    await expect(
      page
        .locator("button")
        .filter({ hasText: /^\d{3}$/ })
        .first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("geolocation button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /location/i })).toBeVisible();
  });

  test("settings button opens settings modal", async ({ page }) => {
    const settingsBtn = page.getByRole("button", { name: "Settings" });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();
    // SettingsModal contains map style options
    await expect(page.getByText(/Standard|Satellite|Terrain/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("global search input accepts input", async ({ page }) => {
    const search = page.getByPlaceholder("Search lines or stops...");
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.fill("200");
    await expect(page.locator("text=/200/").first()).toBeVisible({ timeout: 3000 });
  });

  test("desktop nav links are present", async ({ page }) => {
    await expect(page.locator("a[href='/stations']").first()).toBeVisible();
    await expect(page.locator("a[href='/analytics']").first()).toBeVisible();
    await expect(page.locator("a[href='/community']").first()).toBeVisible();
  });
});
