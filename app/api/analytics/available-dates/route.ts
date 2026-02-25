/**
 * API: Available dates for analytics date picker
 * Returns the range of dates that have aggregated data.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const summaries = await prisma.networkSummaryDaily.findMany({
      select: { date: true },
      orderBy: { date: "asc" },
    });

    const dates = summaries.map((s) => s.date.toISOString().slice(0, 10));

    return NextResponse.json({
      dates,
      earliest: dates[0] || null,
      latest: dates[dates.length - 1] || null,
      count: dates.length,
    });
  } catch (error) {
    console.error("Available dates error:", error);
    return NextResponse.json({ error: "Failed to fetch available dates" }, { status: 500 });
  }
}
