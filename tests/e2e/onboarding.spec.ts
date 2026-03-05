import { test, expect } from "@playwright/test";

test.describe("Onboarding flow", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure onboarding is NOT completed so it shows
    await page.addInitScript(() => {
      localStorage.removeItem("onboarding-completed");
    });
  });

  test("shows onboarding on first visit", async ({ page }) => {
    await page.goto("/");
    // Welcome step: PortoMove heading and Começar button
    await expect(page.getByRole("heading", { name: "PortoMove" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /Começar/i })).toBeVisible();
  });

  test("skip button dismisses onboarding", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=PortoMove", { timeout: 10000 });

    await page.getByRole("button", { name: /Saltar/i }).click();

    // Map should now be visible (header rendered)
    await expect(page.locator("header")).toBeVisible({ timeout: 5000 });
  });

  test("step 1 shows route selection after Começar", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=PortoMove", { timeout: 10000 });

    await page.getByRole("button", { name: /Começar/i }).click();

    // Step 1: route selection heading
    await expect(page.getByRole("heading", { name: /linhas/i })).toBeVisible({ timeout: 5000 });
  });

  test("can skip route selection and reach location step", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("text=PortoMove", { timeout: 10000 });

    await page.getByRole("button", { name: /Começar/i }).click();
    await page.waitForSelector("text=/linhas/i", { timeout: 5000 });

    // Skip routes
    await page.getByRole("button", { name: /Saltar/i }).click();

    // Step 2: location step
    await expect(page.locator("text=/localização|location/i").first()).toBeVisible({
      timeout: 5000,
    });
  });
});
