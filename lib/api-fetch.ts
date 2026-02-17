/**
 * Shared fetch utility with retry, exponential backoff, and timeout.
 * Extracted from app/api/buses/route.ts for consistency across all API routes.
 */

export interface FetchWithRetryOptions {
  maxRetries?: number;
  timeoutMs?: number;
  /** Additional fetch options (headers, method, body, etc.) */
  init?: RequestInit;
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const { maxRetries = 3, timeoutMs = 10000, init = {} } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return response;
      }

      // Don't retry on 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`API returned ${response.status}`);
      }

      // Retry on 5xx (server errors)
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`[fetchWithRetry] Retry ${attempt + 1}/${maxRetries} for ${url} after ${backoffMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw new Error(`API returned ${response.status} after ${maxRetries} attempts`);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[fetchWithRetry] Timeout (${timeoutMs}ms) on attempt ${attempt + 1} for ${url}`);
      }

      if (attempt === maxRetries - 1) {
        throw error;
      }

      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.log(
        `[fetchWithRetry] Retry ${attempt + 1}/${maxRetries} for ${url} after ${backoffMs}ms due to: ${error instanceof Error ? error.message : error}`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw new Error("Max retries exceeded");
}

/**
 * Simple in-memory stale cache for server-side API routes.
 * Stores data with a TTL; returns stale data on cache miss if available.
 */
export class StaleCache<T> {
  private data: T | null = null;
  private timestamp = 0;
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(): { data: T; fresh: boolean } | null {
    if (!this.data) return null;
    const fresh = Date.now() - this.timestamp < this.ttlMs;
    return { data: this.data, fresh };
  }

  set(data: T): void {
    this.data = data;
    this.timestamp = Date.now();
  }

  hasData(): boolean {
    return this.data !== null;
  }
}

/**
 * Per-key in-memory stale cache (e.g., per gtfsId for station departures).
 */
export class KeyedStaleCache<T> {
  private entries = new Map<string, { data: T; timestamp: number }>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(ttlMs: number, maxEntries = 500) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  get(key: string): { data: T; fresh: boolean } | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const fresh = Date.now() - entry.timestamp < this.ttlMs;
    return { data: entry.data, fresh };
  }

  set(key: string, data: T): void {
    // Evict oldest if at capacity
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { data, timestamp: Date.now() });
  }
}
