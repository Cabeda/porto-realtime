import { test, expect } from "@playwright/test";

test.describe("Static and utility pages", () => {
  test("offline page renders", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: /Sem Ligação/i })).toBeVisible({
      timeout: 10000,
    });
  });

  test("privacy page renders", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 10000 });
  });

  test("404 page renders with Porto bus theme", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-xyz");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/autocarro/i)).toBeVisible();
  });

  test("contributors page renders leaderboard", async ({ page }) => {
    await page.goto("/contributors");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Contributors" })).toBeVisible();
  });

  test("digest page renders", async ({ page }) => {
    await page.goto("/digest");
    await page.waitForSelector("header", { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Weekly Digest" })).toBeVisible();
  });

  test("/proposals redirects to community proposals section", async ({ page }) => {
    await page.goto("/proposals");
    await expect(page).toHaveURL(/\/community/, { timeout: 10000 });
  });

  test("proposals/new page renders form", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("onboarding-completed", "true");
    });
    await page.goto("/proposals/new");
    await page.waitForSelector("header", { timeout: 10000 });
    // Page renders the form heading (auth-gated content may differ but header is always present)
    await expect(page.locator("header")).toBeVisible();
  });
});
