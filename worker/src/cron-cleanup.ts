/**
 * Cron: Cleanup positions older than 24 hours
 */

import { prisma } from "./prisma.js";

export async function runCleanupPositions(): Promise<void> {
  const startTime = Date.now();
  const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days

  const result = await prisma.busPositionLog.deleteMany({
    where: { recordedAt: { lt: cutoff } },
  });

  const elapsed = Date.now() - startTime;
  console.log(
    `[cleanup] Deleted ${result.count} positions older than ${cutoff.toISOString()} in ${elapsed}ms`
  );
}
