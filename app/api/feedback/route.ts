import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = ["LINE", "STOP"] as const;
const MAX_COMMENT_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 20; // max 20 submissions per hour

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

async function getOrCreateUser(anonId: string) {
  return prisma.user.upsert({
    where: { anonId },
    update: {},
    create: { anonId },
  });
}

async function checkRateLimit(userId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.feedback.count({
    where: {
      userId,
      createdAt: { gte: windowStart },
    },
  });
  return recentCount < RATE_LIMIT_MAX;
}

// GET /api/feedback?type=STOP&targetId=2:BRRS2&page=0&limit=10
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const targetId = searchParams.get("targetId");
  const page = parseInt(searchParams.get("page") || "0", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);
  const anonId = request.headers.get("x-anonymous-id");

  if (!type || !targetId) {
    return NextResponse.json(
      { error: "Missing required parameters: type and targetId" },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const feedbackType = type as "LINE" | "STOP";

    const [feedbacks, total, userFeedback] = await Promise.all([
      prisma.feedback.findMany({
        where: { type: feedbackType, targetId },
        orderBy: { createdAt: "desc" },
        skip: page * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          targetId: true,
          rating: true,
          comment: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.feedback.count({
        where: { type: feedbackType, targetId },
      }),
      // Get the current user's feedback if they have one
      anonId
        ? prisma.feedback
            .findFirst({
              where: {
                type: feedbackType,
                targetId,
                user: { anonId },
              },
              select: {
                id: true,
                type: true,
                targetId: true,
                rating: true,
                comment: true,
                createdAt: true,
                updatedAt: true,
              },
            })
        : null,
    ]);

    return NextResponse.json(
      { feedbacks, total, userFeedback },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 }
    );
  }
}

// POST /api/feedback
// Body: { type: "LINE" | "STOP", targetId: string, rating: 1-5, comment?: string }
// Header: x-anonymous-id: <uuid>
export async function POST(request: NextRequest) {
  const anonId = request.headers.get("x-anonymous-id");

  if (!anonId || anonId.length < 10) {
    return NextResponse.json(
      { error: "Missing or invalid x-anonymous-id header" },
      { status: 401 }
    );
  }

  let body: { type?: string; targetId?: string; rating?: number; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, targetId, rating, comment } = body;

  // Validate type
  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate targetId
  if (!targetId || typeof targetId !== "string" || targetId.length === 0) {
    return NextResponse.json(
      { error: "targetId is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  // Validate rating
  if (typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return NextResponse.json(
      { error: "rating must be an integer between 1 and 5" },
      { status: 400 }
    );
  }

  // Validate and sanitize comment
  let sanitizedComment: string | null = null;
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== "string") {
      return NextResponse.json(
        { error: "comment must be a string" },
        { status: 400 }
      );
    }
    sanitizedComment = stripHtml(comment).slice(0, MAX_COMMENT_LENGTH);
    if (sanitizedComment.length === 0) {
      sanitizedComment = null;
    }
  }

  try {
    // Get or create user
    const user = await getOrCreateUser(anonId);

    // Check rate limit
    const allowed = await checkRateLimit(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    const feedbackType = type as "LINE" | "STOP";

    // Upsert: update if existing, create if new
    const feedback = await prisma.feedback.upsert({
      where: {
        userId_type_targetId: {
          userId: user.id,
          type: feedbackType,
          targetId,
        },
      },
      update: {
        rating,
        comment: sanitizedComment,
      },
      create: {
        userId: user.id,
        type: feedbackType,
        targetId,
        rating,
        comment: sanitizedComment,
      },
      select: {
        id: true,
        type: true,
        targetId: true,
        rating: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ feedback }, { status: 200 });
  } catch (error) {
    console.error("Error creating/updating feedback:", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}
