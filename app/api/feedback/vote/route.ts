import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/feedback/vote — toggle upvote on a feedback review
// Body: { feedbackId: string }
// Auth: session cookie required
export async function POST(request: NextRequest) {
  const { data: session } = await auth.getSession();
  const sessionUser = session?.user ?? null;

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Authentication required. Please sign in." },
      { status: 401 }
    );
  }

  // Find or create app User
  const user = await prisma.user.upsert({
    where: { email: sessionUser.email },
    update: {},
    create: { email: sessionUser.email, emailVerified: new Date() },
    select: { id: true },
  });

  let body: { feedbackId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { feedbackId } = body;

  if (!feedbackId || typeof feedbackId !== "string") {
    return NextResponse.json(
      { error: "feedbackId is required" },
      { status: 400 }
    );
  }

  // Verify the feedback exists
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: { id: true, userId: true },
  });

  if (!feedback) {
    return NextResponse.json(
      { error: "Feedback not found" },
      { status: 404 }
    );
  }

  // Don't allow users to upvote their own reviews
  if (feedback.userId === user.id) {
    return NextResponse.json(
      { error: "Cannot upvote your own review" },
      { status: 400 }
    );
  }

  try {
    // Toggle: if vote exists, remove it; if not, create it
    const existingVote = await prisma.feedbackVote.findUnique({
      where: {
        userId_feedbackId: {
          userId: user.id,
          feedbackId,
        },
      },
    });

    if (existingVote) {
      await prisma.feedbackVote.delete({
        where: { id: existingVote.id },
      });
    } else {
      await prisma.feedbackVote.create({
        data: {
          userId: user.id,
          feedbackId,
        },
      });
    }

    // Return updated vote count
    const voteCount = await prisma.feedbackVote.count({
      where: { feedbackId },
    });

    return NextResponse.json({
      voted: !existingVote,
      voteCount,
    });
  } catch (error) {
    console.error("Error toggling vote:", error);
    return NextResponse.json(
      { error: "Failed to toggle vote" },
      { status: 500 }
    );
  }
}
