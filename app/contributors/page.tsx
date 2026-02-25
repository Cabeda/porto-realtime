"use client";

import useSWR from "swr";
import Link from "next/link";
import { DesktopNav } from "@/components/DesktopNav";
import { BADGES } from "@/lib/badges";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ContributorBadge {
  id: string;
  emoji: string;
  label: string;
}

interface Contributor {
  rank: number;
  reviewCount: number;
  totalVotes: number;
  badges: ContributorBadge[];
}

const RANK_MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function ContributorsPage() {
  const { data, isLoading } = useSWR<{ contributors: Contributor[] }>(
    "/api/contributors",
    fetcher,
    { revalidateOnFocus: false }
  );

  return (
    <div className="min-h-screen bg-[var(--color-surface-sunken)] text-[var(--color-content)]">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href="/reviews" className="text-sm text-accent hover:text-accent-hover">
              &larr;
            </Link>
            <h1 className="text-xl font-bold">Contributors</h1>
          </div>
          <DesktopNav />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Badge legend */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6">
          <h2 className="text-sm font-semibold mb-3 text-[var(--color-content-secondary)]">
            Badges
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.values(BADGES).map((b) => (
              <div key={b.id} className="flex items-start gap-2 text-sm">
                <span className="text-lg leading-none">{b.emoji}</span>
                <div>
                  <span className="font-medium">{b.label}</span>
                  <p className="text-xs text-[var(--color-content-secondary)]">{b.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leaderboard */}
        {isLoading && (
          <div className="text-sm text-[var(--color-content-secondary)] text-center py-12">
            Loading…
          </div>
        )}

        {!isLoading && data?.contributors?.length === 0 && (
          <div className="text-sm text-[var(--color-content-secondary)] text-center py-12">
            No contributors yet. Be the first to leave a review!
          </div>
        )}

        {data?.contributors && data.contributors.length > 0 && (
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)] text-[var(--color-content-secondary)] text-xs">
                  <th className="px-4 py-2 text-left w-12">#</th>
                  <th className="px-4 py-2 text-left">Badges</th>
                  <th className="px-4 py-2 text-right">Reviews</th>
                  <th className="px-4 py-2 text-right">Upvotes</th>
                </tr>
              </thead>
              <tbody>
                {data.contributors.map((c) => (
                  <tr
                    key={c.rank}
                    className="border-b border-[var(--color-border)] last:border-0 bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface)] transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[var(--color-content-secondary)]">
                      {RANK_MEDAL[c.rank] ?? c.rank}
                    </td>
                    <td className="px-4 py-3">
                      {c.badges.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {c.badges.map((b) => (
                            <span
                              key={b.id}
                              title={b.label}
                              className="text-base cursor-default"
                              aria-label={b.label}
                            >
                              {b.emoji}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-[var(--color-content-secondary)] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{c.reviewCount}</td>
                    <td className="px-4 py-3 text-right text-[var(--color-content-secondary)]">
                      {c.totalVotes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-[var(--color-content-secondary)]">
          Rankings update hourly. Badges are awarded automatically based on review activity. User
          identities are kept anonymous.
        </p>
      </div>
    </div>
  );
}
