import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateOrigin, safeGetSession } from "@/lib/security";

const VALID_REASONS = ["SPAM", "OFFENSIVE", "MISLEADING", "OTHER"] as const;
const REPORT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const REPORT_RATE_LIMIT_MAX = 10;
const AUTO_HIDE_THRESHOLD = 3;

// POST /api/proposals/report
// Body: { proposalId, reason }
export async function POST(request: NextRequest) {
  const csrfError = validateOrigin(request);
  if (csrfError) return csrfError;

  const sessionUser = await safeGetSession(auth);

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const user = await prisma.user.upsert({
    where: { email: sessionUser.email },
    update: {},
    create: { email: sessionUser.email, emailVerified: new Date() },
    select: { id: true },
  });

  let body: { proposalId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { proposalId, reason } = body;

  if (!proposalId || typeof proposalId !== "string") {
    return NextResponse.json(
      { error: "proposalId is required" },
      { status: 400 }
    );
  }

  if (
    !reason ||
    !VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])
  ) {
    return NextResponse.json(
      { error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    // Rate limit
    const windowStart = new Date(Date.now() - REPORT_RATE_LIMIT_WINDOW_MS);
    const recentReports = await prisma.proposalReport.count({
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

    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, userId: true },
    });

    if (!proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    if (proposal.userId === user.id) {
      return NextResponse.json(
        { error: "Cannot report your own proposal" },
        { status: 400 }
      );
    }

    const reportReason = reason as "SPAM" | "OFFENSIVE" | "MISLEADING" | "OTHER";
    await prisma.proposalReport.upsert({
      where: {
        proposalId_userId: {
          proposalId,
          userId: user.id,
        },
      },
      update: { reason: reportReason },
      create: {
        proposalId,
        userId: user.id,
        reason: reportReason,
      },
    });

    // Auto-hide after threshold
    const reportCount = await prisma.proposalReport.count({
      where: { proposalId },
    });

    if (reportCount >= AUTO_HIDE_THRESHOLD) {
      await prisma.proposal.update({
        where: { id: proposalId },
        data: { hidden: true },
      });
    }

    return NextResponse.json({ reported: true, reportCount });
  } catch (error) {
    console.error("Error reporting proposal:", error);
    return NextResponse.json(
      { error: "Failed to report proposal" },
      { status: 500 }
    );
  }
}
