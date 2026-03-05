/**
 * Cron job: Cleanup old position data
 *
 * DEPRECATED: Cleanup now runs in the Go worker (cron_cleanup.go) which
 * deletes old R2 snapshot objects instead of BusPositionLog rows.
 * BusPositionLog has been removed from the schema entirely.
 *
 * Authenticated via CRON_SECRET.
 */

import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "deprecated",
    message:
      "Position cleanup now runs in the Go worker (cron_cleanup.go) at 04:00 UTC. " +
      "It deletes R2 snapshot objects older than 2 days. " +
      "BusPositionLog has been removed. " +
      "To trigger manually, run: worker run cleanup-positions",
  });
}
