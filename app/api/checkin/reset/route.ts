import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/checkin/reset — Delete all check-ins (development only)
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  try {
    const { count } = await prisma.checkIn.deleteMany({});
    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error("Error resetting check-ins:", error);
    return NextResponse.json({ error: "Failed to reset check-ins" }, { status: 500 });
  }
}
