import { NextRequest, NextResponse } from "next/server";
import { requestMagicLink } from "@/lib/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/login — request a magic link OTP
export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required" },
      { status: 400 }
    );
  }

  if (email.length > 254) {
    return NextResponse.json(
      { error: "Email address is too long" },
      { status: 400 }
    );
  }

  try {
    await requestMagicLink(email);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return NextResponse.json(
        { error: "Too many requests. Try again in a few minutes." },
        { status: 429 }
      );
    }
    console.error("Error requesting magic link:", error);
    return NextResponse.json(
      { error: "Failed to send login code" },
      { status: 500 }
    );
  }
}
