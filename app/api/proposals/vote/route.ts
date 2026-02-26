import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateOrigin, safeGetSession } from "@/lib/security";

const UNDER_REVIEW_THRESHOLD = 25;

// POST /api/proposals/vote — toggle upvote on a proposal
// Body: { proposalId: string }
export async function POST(request: NextRequest) {
  const csrfError = validateOrigin(request);
  if (csrfError) return csrfError;

  const sessionUser = await safeGetSession(auth);

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Authentication required. Please sign in." },
      { status: 401 }
    );
  }

  const user = await prisma.user.upsert({
    where: { email: sessionUser.email },
    update: {},
    create: { email: sessionUser.email, emailVerified: new Date() },
    select: { id: true },
  });

  let body: { proposalId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { proposalId } = body;

  if (!proposalId || typeof proposalId !== "string") {
    return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
  }

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true },
  });

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  try {
    const existingVote = await prisma.proposalVote.findUnique({
      where: {
        userId_proposalId: {
          userId: user.id,
          proposalId,
        },
      },
    });

    if (existingVote) {
      await prisma.proposalVote.delete({
        where: { id: existingVote.id },
      });
    } else {
      await prisma.proposalVote.create({
        data: {
          userId: user.id,
          proposalId,
        },
      });
    }

    const voteCount = await prisma.proposalVote.count({
      where: { proposalId },
    });

    // Auto-promote to UNDER_REVIEW when threshold is reached
    if (voteCount >= UNDER_REVIEW_THRESHOLD && proposal.status === "OPEN") {
      await prisma.proposal.update({
        where: { id: proposalId },
        data: { status: "UNDER_REVIEW" },
      });
    }

    return NextResponse.json({
      voted: !existingVote,
      voteCount,
    });
  } catch (error) {
    console.error("Error toggling proposal vote:", error);
    return NextResponse.json({ error: "Failed to toggle vote" }, { status: 500 });
  }
}
