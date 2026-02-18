import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkComment } from "@/lib/content-filter";
import { auth } from "@/lib/auth";
import { validateOrigin, safeGetSession } from "@/lib/security";

const VALID_TYPES = ["BIKE_LANE", "STOP", "LINE"] as const;
const VALID_STATUSES = ["OPEN", "UNDER_REVIEW", "CLOSED", "ARCHIVED"] as const;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TARGET_ID_LENGTH = 100;
const MAX_LINK_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10; // max 10 proposals per hour

// Allowed link domains — only well-known civic/transit/mapping platforms
const ALLOWED_LINK_DOMAINS = [
  "portal.queixa.pt",
  "www.portaldasqueixas.pt",
  "www.livroreclamacoes.pt",
  "www.cm-porto.pt",
  "www.stcp.pt",
  "metro.pt",
  "www.metrodoporto.pt",
  "explore.porto.pt",
  "www.google.com", // Google Maps links
  "maps.google.com",
  "goo.gl",
  "www.openstreetmap.org",
  "participar.gov.pt",
  "peticaopublica.com",
  "www.parlamento.pt",
];

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

function validateLinkUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return ALLOWED_LINK_DOMAINS.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith("." + d)
    );
  } catch {
    return false;
  }
}

async function checkRateLimit(userId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.proposal.count({
    where: {
      userId,
      createdAt: { gte: windowStart },
    },
  });
  return recentCount < RATE_LIMIT_MAX;
}

// GET /api/proposals?type=LINE&status=OPEN&sort=votes&page=0&limit=20
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status") || "OPEN";
  const sort = searchParams.get("sort"); // "votes" or default (recent)
  const rawPage = parseInt(searchParams.get("page") || "0", 10);
  const page = Number.isNaN(rawPage) || rawPage < 0 ? 0 : rawPage;
  const rawLimit = parseInt(searchParams.get("limit") || "20", 10);
  const limit = Math.min(Number.isNaN(rawLimit) || rawLimit <= 0 ? 20 : rawLimit, 50);

  const sessionUser = await safeGetSession(auth);

  // Build where clause
  const where: Record<string, unknown> = { hidden: false };

  if (type && VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    where.type = type;
  }

  if (VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    where.status = status;
  }

  try {
    const [proposals, total] = await Promise.all([
      prisma.proposal.findMany({
        where,
        orderBy:
          sort === "votes"
            ? { votes: { _count: "desc" as const } }
            : { createdAt: "desc" as const },
        skip: page * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          targetId: true,
          linkUrl: true,
          status: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { votes: true } },
          ...(sessionUser
            ? {
                votes: {
                  where: { user: { email: sessionUser.email } },
                  select: { id: true },
                },
                reports: {
                  where: { user: { email: sessionUser.email } },
                  select: { id: true },
                },
                user: { select: { email: true } },
              }
            : {}),
        },
      }),
      prisma.proposal.count({ where }),
    ]);

    const transformedProposals = proposals.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      description: p.description,
      targetId: p.targetId,
      linkUrl: p.linkUrl,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      voteCount: p._count.votes,
      userVoted:
        "votes" in p ? (p.votes as { id: string }[]).length > 0 : false,
      userReported:
        "reports" in p ? (p.reports as { id: string }[]).length > 0 : false,
      isOwner:
        sessionUser && "user" in p
          ? (p.user as { email: string })?.email === sessionUser.email
          : false,
    }));

    const headers: Record<string, string> = {};
    if (sessionUser) {
      headers["Cache-Control"] = "private, no-store";
    } else {
      headers["Cache-Control"] =
        "public, s-maxage=30, stale-while-revalidate=120";
    }

    return NextResponse.json(
      { proposals: transformedProposals, total },
      { headers }
    );
  } catch (error) {
    console.error("Error fetching proposals:", error);
    return NextResponse.json(
      { error: "Failed to fetch proposals" },
      { status: 500 }
    );
  }
}

// POST /api/proposals
// Body: { type, title, description, targetId?, linkUrl? }
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
  const userId = user.id;

  let body: {
    type?: string;
    title?: string;
    description?: string;
    targetId?: string;
    linkUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { type, title, description, targetId, linkUrl } = body;

  // Validate type
  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate title
  if (
    !title ||
    typeof title !== "string" ||
    title.trim().length === 0 ||
    title.trim().length > MAX_TITLE_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `Title is required (max ${MAX_TITLE_LENGTH} characters)`,
      },
      { status: 400 }
    );
  }

  // Validate description
  if (
    !description ||
    typeof description !== "string" ||
    description.trim().length < 20 ||
    description.trim().length > MAX_DESCRIPTION_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `Description must be between 20 and ${MAX_DESCRIPTION_LENGTH} characters`,
      },
      { status: 400 }
    );
  }

  // Validate targetId if provided
  if (
    targetId !== undefined &&
    targetId !== null &&
    (typeof targetId !== "string" || targetId.length > MAX_TARGET_ID_LENGTH)
  ) {
    return NextResponse.json(
      { error: `targetId must be a string (max ${MAX_TARGET_ID_LENGTH} chars)` },
      { status: 400 }
    );
  }

  // Validate linkUrl if provided
  if (linkUrl !== undefined && linkUrl !== null && linkUrl !== "") {
    if (typeof linkUrl !== "string" || linkUrl.length > MAX_LINK_LENGTH) {
      return NextResponse.json(
        { error: `Link URL must be a string (max ${MAX_LINK_LENGTH} chars)` },
        { status: 400 }
      );
    }
    if (!validateLinkUrl(linkUrl)) {
      return NextResponse.json(
        {
          error:
            "Link URL must be from a recognized platform (e.g. cm-porto.pt, stcp.pt, Google Maps, OpenStreetMap, Portal da Queixa)",
        },
        { status: 400 }
      );
    }
  }

  // Sanitize
  const sanitizedTitle = stripHtml(title).slice(0, MAX_TITLE_LENGTH);
  const sanitizedDescription = stripHtml(description).slice(
    0,
    MAX_DESCRIPTION_LENGTH
  );

  // Content filter on title
  const titleFilter = checkComment(sanitizedTitle);
  if (!titleFilter.clean) {
    return NextResponse.json({ error: titleFilter.reason }, { status: 400 });
  }

  // Content filter on description — temporarily bypass URL check since
  // the description is plain text (URLs are in the separate linkUrl field)
  const descFilter = checkComment(sanitizedDescription);
  if (!descFilter.clean) {
    return NextResponse.json({ error: descFilter.reason }, { status: 400 });
  }

  try {
    const allowed = await checkRateLimit(userId);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    const proposalType = type as "BIKE_LANE" | "STOP" | "LINE";

    const proposal = await prisma.proposal.create({
      data: {
        userId,
        type: proposalType,
        title: sanitizedTitle,
        description: sanitizedDescription,
        targetId: targetId?.trim() || null,
        linkUrl: linkUrl?.trim() || null,
      },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        targetId: true,
        linkUrl: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Auto-upvote own proposal
    await prisma.proposalVote.create({
      data: {
        userId,
        proposalId: proposal.id,
      },
    });

    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    console.error("Error creating proposal:", error);
    return NextResponse.json(
      { error: "Failed to create proposal" },
      { status: 500 }
    );
  }
}
