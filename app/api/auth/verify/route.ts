import { NextRequest, NextResponse } from "next/server";
import { verifyMagicLink, setSessionCookie } from "@/lib/auth";

// POST /api/auth/verify — verify OTP code and create session
export async function POST(request: NextRequest) {
  let body: { email?: string; code?: string; anonId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const code = body.code?.trim();
  const anonId = body.anonId;

  if (!email || !code) {
    return NextResponse.json(
      { error: "Email and code are required" },
      { status: 400 }
    );
  }

  // Validate code format: 6 digits
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Code must be 6 digits" },
      { status: 400 }
    );
  }

  try {
    const result = await verifyMagicLink(email, code, anonId);

    // Set session cookie
    await setSessionCookie(result.token);

    return NextResponse.json({
      user: result.user,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CODE") {
      return NextResponse.json(
        { error: "Invalid or expired code" },
        { status: 401 }
      );
    }
    console.error("Error verifying magic link:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
