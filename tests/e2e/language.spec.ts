import { test, expect } from "@playwright/test";

test.describe("Language switcher", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("onboarding-completed", "true");
    });
  });

  test("settings modal shows language options", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("header", { timeout: 10000 });

    await page.getByRole("button", { name: /Settings|Definições/i }).click();
    await expect(page.getByText(/Language|Idioma/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("switching to English changes UI language", async ({ page }) => {
    // Start with PT locale
    await page.addInitScript(() => {
      localStorage.setItem("locale", "pt");
    });
    await page.goto("/");
    await page.waitForSelector("header", { timeout: 10000 });

    await page.getByRole("button", { name: /Settings|Definições/i }).click();
    await page.waitForSelector("text=/Language|Idioma/i", { timeout: 5000 });

    // Click English button
    await page.getByRole("button", { name: /English/i }).click();

    // UI should now show English nav labels
    await expect(page.locator("text=Analytics").first()).toBeVisible({ timeout: 5000 });
  });

  test("switching to Portuguese changes UI language", async ({ page }) => {
    // Start with EN locale
    await page.addInitScript(() => {
      localStorage.setItem("locale", "en");
    });
    await page.goto("/");
    await page.waitForSelector("header", { timeout: 10000 });

    await page.getByRole("button", { name: /Settings|Definições/i }).click();
    await page.waitForSelector("text=/Language|Idioma/i", { timeout: 5000 });

    // Click Portuguese button
    await page.getByRole("button", { name: /Português|PT/i }).click();

    // UI should now show Portuguese nav labels
    await expect(page.locator("text=Análise").first()).toBeVisible({ timeout: 5000 });
  });
});
