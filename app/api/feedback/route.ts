import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkComment } from "@/lib/content-filter";
import { resolveUserId, getSessionUser } from "@/lib/auth";

const VALID_TYPES = ["LINE", "STOP", "VEHICLE", "BIKE_PARK", "BIKE_LANE"] as const;
const MAX_COMMENT_LENGTH = 500;
const MAX_TARGET_ID_LENGTH = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 20; // max 20 submissions per hour

// Global IP-based rate limit to prevent anonymous ID minting attacks
const IP_RATE_LIMIT_MAX = 60; // max 60 submissions per IP per hour
const ipSubmissions = new Map<string, { count: number; resetAt: number }>();

// UUID v4 format: 8-4-4-4-12 hex chars
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipSubmissions.get(ip);

  if (!entry || now > entry.resetAt) {
    ipSubmissions.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= IP_RATE_LIMIT_MAX;
}

// Periodic cleanup of expired IP entries to prevent memory leak
// Runs at most once per 10 minutes
let lastIpCleanup = 0;
function cleanupIpMap() {
  const now = Date.now();
  if (now - lastIpCleanup < 600_000) return;
  lastIpCleanup = now;
  for (const [ip, entry] of ipSubmissions) {
    if (now > entry.resetAt) ipSubmissions.delete(ip);
  }
}

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

  // Resolve user identity: prefer session cookie, fall back to anonymous ID
  const sessionUser = await getSessionUser(request);
  const anonId = request.headers.get("x-anonymous-id");
  const validAnonId = anonId && UUID_REGEX.test(anonId) ? anonId : null;
  const hasUserIdentity = !!sessionUser || !!validAnonId;

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
    // Cast validated type string to Prisma's FeedbackType enum
    const feedbackType = type as "LINE" | "STOP" | "VEHICLE" | "BIKE_PARK" | "BIKE_LANE";

    // Build the user feedback query based on auth method
    const userFeedbackQuery = sessionUser
      ? prisma.feedback.findFirst({
          where: {
            type: feedbackType,
            targetId,
            userId: sessionUser.id,
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
      : validAnonId
        ? prisma.feedback.findFirst({
            where: {
              type: feedbackType,
              targetId,
              user: { anonId: validAnonId },
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

    const headers: Record<string, string> = {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
    };

    // When a user identity is present, the response can contain
    // user-specific `userFeedback`. Avoid leaking this from shared caches.
    if (hasUserIdentity) {
      headers["Cache-Control"] = "private, no-store";
      headers["Vary"] = "x-anonymous-id";
    }

    return NextResponse.json(
      { feedbacks, total, userFeedback },
      {
        headers,
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
// Auth: session cookie (authenticated) OR x-anonymous-id header (anonymous)
// Body: { type: "LINE" | "STOP" | "VEHICLE", targetId: string, rating: 1-5, comment?: string, metadata?: { lineContext?: string } }
export async function POST(request: NextRequest) {
  // IP-based rate limit — prevents minting unlimited anonymous IDs
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";

  cleanupIpMap();

  if (!checkIpRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 }
    );
  }

  // Resolve user identity: prefer session cookie, fall back to anonymous ID
  const resolved = await resolveUserId(request);

  if (!resolved) {
    return NextResponse.json(
      { error: "Authentication required. Sign in or provide x-anonymous-id header." },
      { status: 401 }
    );
  }

  const { userId } = resolved;

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
