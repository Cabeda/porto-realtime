import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkComment } from "@/lib/content-filter";
import { auth } from "@/lib/auth";

const VALID_TYPES = ["LINE", "STOP", "VEHICLE", "BIKE_PARK", "BIKE_LANE"] as const;
const MAX_COMMENT_LENGTH = 500;
const MAX_TARGET_ID_LENGTH = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 20; // max 20 submissions per hour

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

async function checkRateLimit(userId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.feedback.count({
    where: {
      userId,
      updatedAt: { gte: windowStart },
    },
  });
  return recentCount < RATE_LIMIT_MAX;
}

// GET /api/feedback?type=STOP&targetId=2:BRRS2&page=0&limit=10
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const targetId = searchParams.get("targetId");
  const rawPage = parseInt(searchParams.get("page") || "0", 10);
  const page = Number.isNaN(rawPage) || rawPage < 0 ? 0 : rawPage;
  const rawLimit = parseInt(searchParams.get("limit") || "10", 10);
  const limit = Math.min(Number.isNaN(rawLimit) || rawLimit <= 0 ? 10 : rawLimit, 50);

  // Resolve user identity from session
  const { data: session } = await auth.getSession();
  const sessionUser = session?.user ?? null;

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
    const feedbackType = type as "LINE" | "STOP" | "VEHICLE" | "BIKE_PARK" | "BIKE_LANE";

    // If authenticated, find the user's own feedback for this target
    const userFeedbackQuery = sessionUser
      ? prisma.feedback.findFirst({
          where: {
            type: feedbackType,
            targetId,
            user: { email: sessionUser.email },
          },
          select: {
            id: true,
            type: true,
            targetId: true,
            rating: true,
            comment: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : Promise.resolve(null);

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
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.feedback.count({
        where: { type: feedbackType, targetId },
      }),
      userFeedbackQuery,
    ]);

    const headers: Record<string, string> = {};

    if (sessionUser) {
      // User-specific response — don't cache in shared caches
      headers["Cache-Control"] = "private, no-store";
    } else {
      headers["Cache-Control"] = "public, s-maxage=30, stale-while-revalidate=120";
    }

    return NextResponse.json(
      { feedbacks, total, userFeedback },
      { headers }
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
// Auth: session cookie (authenticated) — requires sign-in
// Body: { type, targetId, rating, comment?, metadata? }
export async function POST(request: NextRequest) {
  // Resolve user identity from session
  const { data: session } = await auth.getSession();
  const sessionUser = session?.user ?? null;

  if (!sessionUser) {
    return NextResponse.json(
      { error: "Authentication required. Please sign in." },
      { status: 401 }
    );
  }

  // Find or create our app User linked to Neon Auth user
  const user = await prisma.user.upsert({
    where: { email: sessionUser.email },
    update: {},
    create: { email: sessionUser.email, emailVerified: new Date() },
    select: { id: true },
  });
  const userId = user.id;

  let body: { type?: string; targetId?: string; rating?: number; comment?: string; metadata?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, targetId, rating, comment, metadata } = body;

  // Validate type
  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate targetId
  if (!targetId || typeof targetId !== "string" || targetId.length === 0 || targetId.length > MAX_TARGET_ID_LENGTH) {
    return NextResponse.json(
      { error: `targetId is required and must be a non-empty string (max ${MAX_TARGET_ID_LENGTH} chars)` },
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

  // Run content filter on the sanitized comment
  if (sanitizedComment) {
    const filterResult = checkComment(sanitizedComment);
    if (!filterResult.clean) {
      return NextResponse.json(
        { error: filterResult.reason },
        { status: 400 }
      );
    }
  }

  try {
    // Check rate limit
    const allowed = await checkRateLimit(userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    const feedbackType = type as "LINE" | "STOP" | "VEHICLE" | "BIKE_PARK" | "BIKE_LANE";

    // Sanitize metadata: only allow known keys, string values
    let sanitizedMetadata: Record<string, string> | null = null;
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const lineContext = metadata.lineContext;
      if (typeof lineContext === "string" && lineContext.length > 0 && lineContext.length <= 50) {
        sanitizedMetadata = { lineContext: stripHtml(lineContext) };
      }
    }

    // Upsert: update if existing, create if new
    const feedback = await prisma.feedback.upsert({
      where: {
        userId_type_targetId: {
          userId,
          type: feedbackType,
          targetId,
        },
      },
      update: {
        rating,
        comment: sanitizedComment,
        ...(sanitizedMetadata !== null ? { metadata: sanitizedMetadata } : {}),
      },
      create: {
        userId,
        type: feedbackType,
        targetId,
        rating,
        comment: sanitizedComment,
        ...(sanitizedMetadata !== null ? { metadata: sanitizedMetadata } : {}),
      },
      select: {
        id: true,
        type: true,
        targetId: true,
        rating: true,
        comment: true,
        metadata: true,
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
