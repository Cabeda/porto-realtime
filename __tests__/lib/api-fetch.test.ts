import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithRetry, StaleCache, KeyedStaleCache } from "@/lib/api-fetch";

describe("fetchWithRetry", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns response on successful fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "test" }),
    });

    const response = await fetchWithRetry("https://example.com/api");
    expect(response.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 4xx errors", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    globalThis.fetch = mockFetch;

    await expect(fetchWithRetry("https://example.com/api", { maxRetries: 3 })).rejects.toThrow(
      "API returned 404"
    );
    // 4xx errors throw ClientError which is caught and re-thrown immediately
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx errors", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const response = await fetchWithRetry("https://example.com/api", {
      maxRetries: 3,
    });
    expect(response.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on 5xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(fetchWithRetry("https://example.com/api", { maxRetries: 2 })).rejects.toThrow(
      "API returned 500 after 2 attempts"
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on network errors", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const response = await fetchWithRetry("https://example.com/api", {
      maxRetries: 2,
    });
    expect(response.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on network errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(fetchWithRetry("https://example.com/api", { maxRetries: 2 })).rejects.toThrow(
      "Network error"
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("passes init options to fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await fetchWithRetry("https://example.com/api", {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"key":"value"}',
      },
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://example.com/api",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"key":"value"}',
      })
    );
  });
});

describe("StaleCache", () => {
  it("returns null when empty", () => {
    const cache = new StaleCache<string>(1000);
    expect(cache.get()).toBeNull();
  });

  it("returns fresh data within TTL", () => {
    const cache = new StaleCache<string>(1000);
    cache.set("hello");
    const result = cache.get();
    expect(result).not.toBeNull();
    expect(result!.data).toBe("hello");
    expect(result!.fresh).toBe(true);
  });

  it("returns stale data after TTL", async () => {
    const cache = new StaleCache<string>(50);
    cache.set("hello");
    await new Promise((r) => setTimeout(r, 60));
    const result = cache.get();
    expect(result).not.toBeNull();
    expect(result!.data).toBe("hello");
    expect(result!.fresh).toBe(false);
  });

  it("hasData returns false when empty", () => {
    const cache = new StaleCache<string>(1000);
    expect(cache.hasData()).toBe(false);
  });

  it("hasData returns true after set", () => {
    const cache = new StaleCache<string>(1000);
    cache.set("hello");
    expect(cache.hasData()).toBe(true);
  });
});

describe("KeyedStaleCache", () => {
  it("returns null for unknown key", () => {
    const cache = new KeyedStaleCache<string>(1000);
    expect(cache.get("unknown")).toBeNull();
  });

  it("stores and retrieves by key", () => {
    const cache = new KeyedStaleCache<string>(1000);
    cache.set("a", "alpha");
    cache.set("b", "beta");
    expect(cache.get("a")!.data).toBe("alpha");
    expect(cache.get("b")!.data).toBe("beta");
  });

  it("evicts oldest entry when at capacity", () => {
    const cache = new KeyedStaleCache<string>(1000, 2);
    cache.set("a", "alpha");
    cache.set("b", "beta");
    cache.set("c", "gamma"); // should evict "a"
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")!.data).toBe("beta");
    expect(cache.get("c")!.data).toBe("gamma");
  });

  it("does not evict when updating existing key", () => {
    const cache = new KeyedStaleCache<string>(1000, 2);
    cache.set("a", "alpha");
    cache.set("b", "beta");
    cache.set("a", "alpha-updated"); // update, not new entry
    expect(cache.get("a")!.data).toBe("alpha-updated");
    expect(cache.get("b")!.data).toBe("beta");
  });

  it("marks data as stale after TTL", async () => {
    const cache = new KeyedStaleCache<string>(50);
    cache.set("a", "alpha");
    await new Promise((r) => setTimeout(r, 60));
    const result = cache.get("a");
    expect(result).not.toBeNull();
    expect(result!.fresh).toBe(false);
  });
});
