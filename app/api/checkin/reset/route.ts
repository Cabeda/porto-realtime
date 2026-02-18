import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateOrigin, safeGetSession } from "@/lib/security";

// POST /api/checkin/reset — Delete all check-ins (admin only)
export async function POST(request: NextRequest) {
  const csrfError = validateOrigin(request);
  if (csrfError) return csrfError;

  const sessionUser = await safeGetSession(auth);
  if (!sessionUser) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Only allow admins to reset check-ins
  const user = await prisma.user.findUnique({
    where: { email: sessionUser.email },
    select: { role: true },
  });

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { count } = await prisma.checkIn.deleteMany({});
    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error("Error resetting check-ins:", error);
    return NextResponse.json({ error: "Failed to reset check-ins" }, { status: 500 });
  }
}
