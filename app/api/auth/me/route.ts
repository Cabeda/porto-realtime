import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// GET /api/auth/me — get current authenticated user
export async function GET() {
  try {
    const user = await getSessionUser();
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error getting session user:", error);
    return NextResponse.json({ user: null });
  }
}
