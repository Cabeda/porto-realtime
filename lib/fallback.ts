/**
 * Server-side static fallback data reader.
 * Reads pre-generated JSON snapshots from public/fallback/ as a last resort
 * when both the live API and in-memory stale cache are empty.
 */
import { readFile } from "fs/promises";
import { join } from "path";

const FALLBACK_DIR = join(process.cwd(), "public", "fallback");

export async function readFallback<T>(filename: string): Promise<T | null> {
  try {
    const raw = await readFile(join(FALLBACK_DIR, filename), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    // File doesn't exist or is invalid — no fallback available
    return null;
  }
}
