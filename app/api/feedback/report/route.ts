import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateOrigin, safeGetSession } from "@/lib/security";

const VALID_REASONS = ["SPAM", "OFFENSIVE", "MISLEADING", "OTHER"] as const;
const REPORT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const REPORT_RATE_LIMIT_MAX = 10; // max 10 reports per user per hour
const AUTO_HIDE_THRESHOLD = 3; // hide after N reports

// POST /api/feedback/report
// Body: { feedbackId, reason }
export async function POST(request: NextRequest) {
  const csrfError = validateOrigin(request);
  if (csrfError) return csrfError;

  const sessionUser = await safeGetSession(auth);

  if (!sessionUser) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { email: sessionUser.email },
    update: {},
    create: { email: sessionUser.email, emailVerified: new Date() },
    select: { id: true },
  });

  let body: { feedbackId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { feedbackId, reason } = body;

  if (!feedbackId || typeof feedbackId !== "string") {
    return NextResponse.json({ error: "feedbackId is required" }, { status: 400 });
  }

  if (!reason || !VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])) {
    return NextResponse.json(
      { error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // Rate limit reports
    const windowStart = new Date(Date.now() - REPORT_RATE_LIMIT_WINDOW_MS);
    const recentReports = await prisma.report.count({
      where: {
        userId: user.id,
        createdAt: { gte: windowStart },
      },
    });

    if (recentReports >= REPORT_RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: "Report rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    // Check feedback exists
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { id: true, userId: true },
    });

    if (!feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    // Don't allow reporting own feedback
    if (feedback.userId === user.id) {
      return NextResponse.json({ error: "Cannot report your own feedback" }, { status: 400 });
    }

    // Upsert report (one per user per feedback)
    const reportReason = reason as "SPAM" | "OFFENSIVE" | "MISLEADING" | "OTHER";
    await prisma.report.upsert({
      where: {
        feedbackId_userId: {
          feedbackId,
          userId: user.id,
        },
      },
      update: { reason: reportReason },
      create: {
        feedbackId,
        userId: user.id,
        reason: reportReason,
      },
    });

    // Check if auto-hide threshold is reached
    const reportCount = await prisma.report.count({
      where: { feedbackId },
    });

    if (reportCount >= AUTO_HIDE_THRESHOLD) {
      await prisma.feedback.update({
        where: { id: feedbackId },
        data: { hidden: true },
      });
    }

    return NextResponse.json({ reported: true, reportCount });
  } catch (error) {
    console.error("Error reporting feedback:", error);
    return NextResponse.json({ error: "Failed to report feedback" }, { status: 500 });
  }
}
