import { test, expect } from "@playwright/test";

// The sign-in button (UserMenu) is present on review pages, not the homepage
test.describe("Auth modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("onboarding-completed", "true");
    });
    await page.goto("/community");
    await page.waitForSelector("header", { timeout: 10000 });
  });

  test("Sign in button opens auth modal", async ({ page }) => {
    await page.getByRole("button", { name: /Entrar|Sign in/i }).click();

    // Auth modal should appear with email input
    await expect(page.locator("input[type='email']")).toBeVisible({ timeout: 5000 });
  });

  test("auth modal has password field and submit button", async ({ page }) => {
    await page.getByRole("button", { name: /Entrar|Sign in/i }).click();

    await expect(page.locator("input[type='password']")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /Entrar|Sign in/i }).last()).toBeVisible();
  });

  test("auth modal can be closed", async ({ page }) => {
    await page.getByRole("button", { name: /Entrar|Sign in/i }).click();
    await page.waitForSelector("input[type='password']", { timeout: 5000 });

    // Close via Escape
    await page.keyboard.press("Escape");
    await expect(page.locator("input[type='password']")).not.toBeVisible({ timeout: 3000 });
  });

  test("auth modal shows Google sign-in option", async ({ page }) => {
    await page.getByRole("button", { name: /Entrar|Sign in/i }).click();
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible({ timeout: 5000 });
  });
});
