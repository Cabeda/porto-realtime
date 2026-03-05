/**
 * Cron job: Daily aggregation pipeline (#67)
 *
 * DEPRECATED: Aggregation now runs in the Go worker (cron_aggregate.go) which
 * reads positions from R2 snapshots instead of BusPositionLog.
 * This route is kept as a manual trigger that delegates to the worker's CLI.
 *
 * Authenticated via CRON_SECRET.
 */

import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "deprecated",
    message:
      "Daily aggregation now runs in the Go worker (cron_aggregate.go) at 03:00 UTC. " +
      "It reads positions from R2 snapshots instead of BusPositionLog. " +
      "To trigger manually, run: worker run aggregate-daily",
  });
}
