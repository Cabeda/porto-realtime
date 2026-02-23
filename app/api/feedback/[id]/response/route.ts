/**
 * POST /api/feedback/[id]/response
 *
 * Allows a user with role=OPERATOR to post an official response to a feedback item.
 * Sets the feedback status and stores a public message.
 *
 * Auth: session cookie, role must be OPERATOR or ADMIN
 * Body: { status: FeedbackStatus, message: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { safeGetSession } from "@/lib/security";
import { UserRole, FeedbackStatus } from "@/prisma/generated/prisma/enums";

const VALID_STATUSES = [
  FeedbackStatus.ACKNOWLEDGED,
  FeedbackStatus.UNDER_REVIEW,
  FeedbackStatus.PLANNED_FIX,
  FeedbackStatus.RESOLVED,
] as const;

const MAX_MESSAGE_LENGTH = 1000;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: feedbackId } = await params;

  const sessionUser = await safeGetSession(auth);
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify operator/admin role
  const dbUser = await prisma.user.findFirst({
    where: { email: sessionUser.email },
    select: { id: true, role: true },
  });

  if (!dbUser || (dbUser.role !== UserRole.OPERATOR && dbUser.role !== UserRole.ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { status?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status, message } = body;

  if (!status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const trimmedMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);
  const feedbackStatus = status as FeedbackStatus;

  // Verify feedback exists
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: { id: true },
  });

  if (!feedback) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  // Upsert response + update feedback status atomically
  const [response] = await prisma.$transaction([
    prisma.operatorResponse.upsert({
      where: { feedbackId },
      create: {
        feedbackId,
        operatorId: dbUser.id,
        status: feedbackStatus,
        message: trimmedMessage,
      },
      update: {
        operatorId: dbUser.id,
        status: feedbackStatus,
        message: trimmedMessage,
        updatedAt: new Date(),
      },
    }),
    prisma.feedback.update({
      where: { id: feedbackId },
      data: { status: feedbackStatus },
    }),
  ]);

  return NextResponse.json({ response }, { status: 200 });
}
