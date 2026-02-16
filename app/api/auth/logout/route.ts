import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

// POST /api/auth/logout — clear session
export async function POST() {
  try {
    await clearSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error during logout:", error);
    return NextResponse.json(
      { error: "Logout failed" },
      { status: 500 }
    );
  }
}
