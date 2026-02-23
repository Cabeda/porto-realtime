"use client";

import useSWR from "swr";
import Link from "next/link";
import { DesktopNav } from "@/components/DesktopNav";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DigestIssue {
  id: string;
  type: string;
  targetId: string;
  rating: number;
  comment: string | null;
  tags: string[];
  voteCount: number;
}

interface DigestTarget {
  type: string;
  targetId: string;
  avg: number;
  count: number;
}

interface DigestData {
  weekLabel: string;
  since: string;
  until: string;
  stats: { newReviews: number; newVotes: number; activeReviewers: number };
  topIssues: DigestIssue[];
  worst: DigestTarget[];
  best: DigestTarget[];
}

const TYPE_ICON: Record<string, string> = {
  LINE: "🚌",
  STOP: "🚏",
  VEHICLE: "🚍",
  BIKE_PARK: "🚲",
  BIKE_LANE: "🛤️",
};

function targetLabel(type: string, targetId: string) {
  if (type === "LINE") return `Line ${targetId}`;
  if (type === "VEHICLE") return `Vehicle ${targetId}`;
  if (type === "BIKE_PARK") return `Bike park ${targetId}`;
  if (type === "BIKE_LANE") return `Bike lane ${targetId}`;
  return targetId;
}

function targetHref(type: string, targetId: string) {
  if (type === "LINE") return `/reviews/line?id=${encodeURIComponent(targetId)}`;
  if (type === "STOP") return `/reviews/stop?id=${encodeURIComponent(targetId)}`;
  if (type === "VEHICLE") return `/reviews/vehicle?id=${encodeURIComponent(targetId)}`;
  if (type === "BIKE_PARK") return `/reviews/bike-park?id=${encodeURIComponent(targetId)}`;
  if (type === "BIKE_LANE") return `/reviews/bike-lane?id=${encodeURIComponent(targetId)}`;
  return null;
}

function Stars({ rating }: { rating: number }) {
  const n = Math.round(rating);
  return (
    <span className="text-yellow-400 text-sm">
      {"★".repeat(n)}{"☆".repeat(5 - n)}
    </span>
  );
}

function TargetRow({ item, rank, variant }: { item: DigestTarget; rank: number; variant: "worst" | "best" }) {
  const href = targetHref(item.type, item.targetId);
  const border = variant === "best" ? "border-l-green-500" : item.avg <= 2 ? "border-l-red-500" : "border-l-orange-400";
  const inner = (
    <div className={`flex items-center gap-3 p-3 rounded-lg border-l-4 bg-[var(--color-surface)] hover:shadow-md transition-shadow ${border}`}>
      <span className="text-[var(--color-content-secondary)] text-xs font-mono w-4">{rank}</span>
      <span>{TYPE_ICON[item.type] ?? "📋"}</span>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-[var(--color-content)] truncate block">
          {targetLabel(item.type, item.targetId)}
        </span>
        <span className="text-xs text-[var(--color-content-muted)]">{item.count} review{item.count !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-sm font-bold text-[var(--color-content-secondary)]">{item.avg.toFixed(1)}</span>
        <Stars rating={item.avg} />
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function DigestPage() {
  const { data, isLoading } = useSWR<DigestData>("/api/digest/data", fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-[var(--color-surface-raised)] shadow-sm border-b border-[var(--color-border)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/community" className="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]">
              &larr;
            </Link>
            <h1 className="text-xl font-bold">Weekly Digest</h1>
          </div>
          <DesktopNav />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-[var(--color-surface)] animate-pulse" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* Header card */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <p className="text-xs text-[var(--color-content-muted)] mb-1">Porto transit community</p>
              <h2 className="text-lg font-bold mb-4">{data.weekLabel}</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold">{data.stats.newReviews}</div>
                  <div className="text-xs text-[var(--color-content-muted)]">New reviews</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{data.stats.newVotes}</div>
                  <div className="text-xs text-[var(--color-content-muted)]">Upvotes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{data.stats.activeReviewers}</div>
                  <div className="text-xs text-[var(--color-content-muted)]">Reviewers</div>
                </div>
              </div>
            </div>

            {/* Top upvoted issues */}
            {data.topIssues.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-1">Top upvoted issues</h3>
                <p className="text-xs text-[var(--color-content-muted)] mb-3">Most community-supported reports this week</p>
                <div className="space-y-2">
                  {data.topIssues.map((issue, i) => {
                    const href = targetHref(issue.type, issue.targetId);
                    const inner = (
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:shadow-md transition-shadow">
                        <span className="text-[var(--color-content-secondary)] text-xs font-mono w-4 mt-0.5">{i + 1}</span>
                        <span className="mt-0.5">{TYPE_ICON[issue.type] ?? "📋"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm truncate">{targetLabel(issue.type, issue.targetId)}</span>
                            <Stars rating={issue.rating} />
                            <span className="ml-auto text-xs text-[var(--color-accent)] font-medium flex-shrink-0">
                              ▲ {issue.voteCount}
                            </span>
                          </div>
                          {issue.comment && (
                            <p className="text-xs text-[var(--color-content-secondary)] line-clamp-2 italic">
                              &ldquo;{issue.comment}&rdquo;
                            </p>
                          )}
                          {issue.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {issue.tags.map((tag) => (
                                <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-surface-sunken)] text-[var(--color-content-muted)]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    return href ? <Link key={issue.id} href={href}>{inner}</Link> : <div key={issue.id}>{inner}</div>;
                  })}
                </div>
              </section>
            )}

            {/* Worst rated */}
            {data.worst.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-1">Needs improvement</h3>
                <p className="text-xs text-[var(--color-content-muted)] mb-3">Lowest-rated lines and stops this week</p>
                <div className="space-y-2">
                  {data.worst.map((item, i) => (
                    <TargetRow key={`${item.type}:${item.targetId}`} item={item} rank={i + 1} variant="worst" />
                  ))}
                </div>
              </section>
            )}

            {/* Best rated */}
            {data.best.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-1">What&apos;s working well</h3>
                <p className="text-xs text-[var(--color-content-muted)] mb-3">Highest-rated lines and stops this week</p>
                <div className="space-y-2">
                  {data.best.map((item, i) => (
                    <TargetRow key={`${item.type}:${item.targetId}`} item={item} rank={i + 1} variant="best" />
                  ))}
                </div>
              </section>
            )}

            {data.stats.newReviews === 0 && data.topIssues.length === 0 && (
              <div className="text-center py-12 text-[var(--color-content-muted)] text-sm">
                No community activity this week yet. Be the first to leave a review!
              </div>
            )}

            <p className="text-xs text-[var(--color-content-muted)] text-center pt-2">
              Updates hourly &middot; <Link href="/community" className="text-[var(--color-accent)] hover:underline">View full community</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
