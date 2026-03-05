/**
 * FIWARE bus data refreshes in a ~4s burst starting at second :25 of every minute.
 * This utility computes how many milliseconds to wait before the next fetch,
 * targeting second :30 (2s after the burst ends at :28) so we always retrieve
 * the freshest possible snapshot — data that is only 2–5s old.
 *
 * Timeline:
 *   :25–:28  FIWARE burst arrives
 *   :30      we fetch → data is 2–5s old  ✓
 *   (wait ~60s)
 *   :25–:28  next burst arrives
 *   :30      we fetch again
 *
 * Result: 1 req/min, data is never more than ~5s stale.
 */

/** Second within the minute to fire the fetch (2s after the :28 burst end). */
export const BURST_TARGET_SECOND = 30;

/**
 * Returns milliseconds until the next occurrence of `BURST_TARGET_SECOND`.
 * Always returns at least `minDelayMs` to avoid tight loops on clock skew.
 */
export function msUntilNextBurst(now: number = Date.now(), minDelayMs = 1000): number {
  const d = new Date(now);
  const sec = d.getSeconds();
  const ms = d.getMilliseconds();

  let secsToWait: number;
  if (sec < BURST_TARGET_SECOND) {
    secsToWait = BURST_TARGET_SECOND - sec;
  } else {
    // Already past target this minute — wait until target in the next minute
    secsToWait = 60 - sec + BURST_TARGET_SECOND;
  }

  const delay = secsToWait * 1000 - ms;
  return Math.max(delay, minDelayMs);
}
