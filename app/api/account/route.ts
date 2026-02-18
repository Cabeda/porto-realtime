import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { validateOrigin, safeGetSession } from "@/lib/security";

// DELETE /api/account — Delete user account and all associated data (GDPR Article 17 — Right to Erasure)
// Cascading deletes handle: feedbacks, feedback votes, reports, check-ins
export async function DELETE(request: NextRequest) {
  const csrfError = validateOrigin(request);
  if (csrfError) return csrfError;

  const sessionUser = await safeGetSession(auth);

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete user — cascading deletes remove all related data
    // (Feedback, FeedbackVote, Report, CheckIn all have onDelete: Cascade)
    await prisma.user.delete({
      where: { id: user.id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}

// GET /api/account — Export all user data (GDPR Article 20 — Right to Data Portability)
// Returns all personal data in a structured JSON format
export async function GET() {
  const sessionUser = await safeGetSession(auth);

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: sessionUser.email },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        feedbacks: {
          select: {
            type: true,
            targetId: true,
            rating: true,
            comment: true,
            tags: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        feedbackVotes: {
          select: {
            feedbackId: true,
            createdAt: true,
          },
        },
        reports: {
          select: {
            feedbackId: true,
            reason: true,
            createdAt: true,
          },
        },
        checkIns: {
          select: {
            mode: true,
            targetId: true,
            createdAt: true,
            expiresAt: true,
            // Intentionally exclude lat/lon from export — location data is ephemeral
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        exportDate: new Date().toISOString(),
        user: {
          email: user.email,
          name: user.name,
          memberSince: user.createdAt,
        },
        feedbacks: user.feedbacks,
        votes: user.feedbackVotes,
        reports: user.reports,
        checkIns: user.checkIns,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="portomove-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("Error exporting account data:", error);
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    );
  }
}
