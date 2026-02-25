import { test, expect } from "@playwright/test";

test.describe("Performance Tests", () => {
  test("homepage should load in less than 1 second", async ({ page }) => {
    const startTime = Date.now();

    // Navigate to homepage
    await page.goto("http://localhost:3000", {
      waitUntil: "domcontentloaded",
    });

    // Wait for main content to be visible (map container)
    await page.waitForSelector("main", { timeout: 1000 });

    const loadTime = Date.now() - startTime;

    console.log(`Homepage load time: ${loadTime}ms`);

    // Assert load time is under 1 second
    expect(loadTime).toBeLessThan(1000);
  });

  test("homepage should show initial UI elements immediately", async ({ page }) => {
    const startTime = Date.now();

    await page.goto("http://localhost:3000");

    // Check that critical UI elements are present quickly
    const header = await page.waitForSelector("header", { timeout: 500 });
    const mainContent = await page.waitForSelector("main", { timeout: 500 });

    const timeToInteractive = Date.now() - startTime;

    console.log(`Time to interactive: ${timeToInteractive}ms`);

    expect(header).toBeTruthy();
    expect(mainContent).toBeTruthy();
    expect(timeToInteractive).toBeLessThan(1000);
  });

  test("stations page should load in less than 1 second", async ({ page }) => {
    const startTime = Date.now();

    await page.goto("http://localhost:3000/stations", {
      waitUntil: "domcontentloaded",
    });

    // Wait for main content
    await page.waitForSelector("main", { timeout: 1000 });

    const loadTime = Date.now() - startTime;

    console.log(`Stations page load time: ${loadTime}ms`);

    expect(loadTime).toBeLessThan(1000);
  });

  test("API response time should be fast", async ({ page }) => {
    // Navigate to homepage first to initialize
    await page.goto("http://localhost:3000");

    // Measure API response times
    const [busesResponse] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/api/buses") && response.status() === 200
      ),
    ]);

    const busesTime = (await busesResponse.headerValue("x-response-time")) || "N/A";
    console.log(`Buses API response time: ${busesTime}`);
  });

  test("map should render progressively", async ({ page }) => {
    await page.goto("http://localhost:3000");

    // Check that map container appears quickly
    const mapContainer = await page.waitForSelector("main", { timeout: 500 });
    expect(mapContainer).toBeTruthy();

    // Check for loading indicator initially
    const loadingState = await page.locator("text=/A carregar/i").first();
    const hasLoadingState = (await loadingState.count()) > 0;

    console.log(`Has loading state: ${hasLoadingState}`);
  });
});
