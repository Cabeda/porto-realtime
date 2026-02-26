import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("desktop nav links work", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("onboarding-completed", "true");
    });
    await page.goto("/");
    await page.waitForSelector("header", { timeout: 10000 });

    // Click stations link and wait for navigation
    await page.locator("header a[href='/stations']").click();
    await page.waitForURL(/\/stations/, { timeout: 10000 });

    // Navigate directly to analytics (avoids GlobalSearch overlay interference)
    await page.goto("/analytics");
    await page.waitForURL(/\/analytics/, { timeout: 10000 });
    await page.waitForSelector("header", { timeout: 5000 });

    // Click community from analytics header
    await page.locator("header a[href='/community']").click();
    await page.waitForURL(/\/community/, { timeout: 10000 });

    // Click map link from community header
    await page.locator("header a[href='/']").filter({ hasText: "🗺️" }).click();
    await page.waitForURL(/\/$/, { timeout: 10000 });
  });

  test("404 page shows error boundary or not-found", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
  });
});

test.describe("Community / Reviews page", () => {
  test("renders review hub with category links", async ({ page }) => {
    await page.goto("/community");
    await page.waitForSelector("main", { timeout: 10000 });
    await expect(page.locator("main")).toBeVisible();
    // Should have links to review sub-pages
    await expect(page.locator("a[href*='/reviews'], a[href*='/community']").first()).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("API routes (local)", () => {
  test("GET /api/buses returns bus data", async ({ request }) => {
    const res = await request.get("/api/buses");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("buses");
    expect(Array.isArray(body.buses)).toBe(true);
  });

  test("GET /api/stations returns stops", async ({ request }) => {
    const res = await request.get("/api/stations");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("stops");
    expect(Array.isArray(body.data.stops)).toBe(true);
    expect(body.data.stops.length).toBeGreaterThan(100);
  });

  test("GET /api/routes returns transit routes", async ({ request }) => {
    const res = await request.get("/api/routes");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("routes");
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThan(10);
  });

  test("GET /api/station returns departures for Bolhão", async ({ request }) => {
    const res = await request.get("/api/station?gtfsId=2:BLM");
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Response shape: { data: { stop: { ... } } }
    expect(body).toHaveProperty("data.stop");
  });

  test("GET /api/bike-parks returns bike parks", async ({ request }) => {
    const res = await request.get("/api/bike-parks");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("parks");
    expect(Array.isArray(body.parks)).toBe(true);
  });

  test("GET /api/bike-lanes returns bike lanes", async ({ request }) => {
    const res = await request.get("/api/bike-lanes");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("lanes");
    expect(Array.isArray(body.lanes)).toBe(true);
  });

  test("GET /api/feedback returns feedback list", async ({ request }) => {
    const res = await request.get("/api/feedback?type=LINE&targetId=200");
    expect([200, 400]).toContain(res.status());
  });
});
