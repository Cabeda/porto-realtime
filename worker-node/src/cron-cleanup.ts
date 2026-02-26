/**
 * Cron: Cleanup positions older than 1 day
 * Safe to run after archive (03:30) has exported yesterday's data to R2.
 */

import { prisma } from "./prisma.js";

export async function runCleanupPositions(): Promise<void> {
  const startTime = Date.now();
  const cutoff = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day

  const result = await prisma.busPositionLog.deleteMany({
    where: { recordedAt: { lt: cutoff } },
  });

  const elapsed = Date.now() - startTime;
  console.log(
    `[cleanup] Deleted ${result.count} positions older than ${cutoff.toISOString()} in ${elapsed}ms`
  );
}
