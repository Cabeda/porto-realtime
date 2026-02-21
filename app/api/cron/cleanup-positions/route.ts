import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Cron job: Delete raw bus positions older than 24 hours.
 *
 * Runs daily at 04:00 UTC (after aggregation at 03:00).
 * Raw data is archived to Hetzner Object Storage before deletion (see #74).
 *
 * Authenticated via CRON_SECRET to prevent unauthorized access.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days

    const result = await prisma.busPositionLog.deleteMany({
      where: {
        recordedAt: {
          lt: cutoff,
        },
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(
      `Cleanup: deleted ${result.count} positions older than ${cutoff.toISOString()} in ${elapsed}ms`
    );

    return NextResponse.json({
      deleted: result.count,
      cutoff: cutoff.toISOString(),
      elapsed: `${elapsed}ms`,
    });
  } catch (error) {
    console.error("Cleanup failed:", error);
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 }
    );
  }
}
