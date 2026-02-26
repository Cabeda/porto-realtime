"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";
import { UpvoteButton } from "@/components/UpvoteButton";
import { ReportButton } from "@/components/ReportButton";
import { ShareButton } from "@/components/ShareButton";
import { EscalationPrompt } from "@/components/EscalationPrompt";
import { BADGES, type BadgeId } from "@/lib/badges";
import type { FeedbackItem, FeedbackTag, FeedbackStatus } from "@/lib/types";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  OPEN: "",
  ACKNOWLEDGED: "Acknowledged",
  UNDER_REVIEW: "Under review",
  PLANNED_FIX: "Fix planned",
  RESOLVED: "Resolved",
};

const STATUS_COLOR: Record<FeedbackStatus, string> = {
  OPEN: "",
  ACKNOWLEDGED: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  PLANNED_FIX: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  RESOLVED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

interface ReviewCardProps {
  feedback: FeedbackItem;
  /** Optional extra badge (e.g. line context for vehicle reviews) */
  badge?: React.ReactNode;
  /** Target name for share text */
  targetName?: string;
}

const TAG_EMOJI: Record<FeedbackTag, string> = {
  OVERCROWDED: "🚌",
  LATE: "⏰",
  DIRTY: "🧹",
  ACCESSIBILITY: "♿",
  SAFETY: "🛡️",
  BROKEN_INFRASTRUCTURE: "🔧",
  FREQUENCY: "📊",
  ROUTE_COVERAGE: "🗺️",
};

export function ReviewCard({ feedback: f, badge, targetName }: ReviewCardProps) {
  const t = useTranslations();

  const tagLabels: Record<FeedbackTag, string> = {
    OVERCROWDED: t.feedback.tagOvercrowded,
    LATE: t.feedback.tagLate,
    DIRTY: t.feedback.tagDirty,
    ACCESSIBILITY: t.feedback.tagAccessibility,
    SAFETY: t.feedback.tagSafety,
    BROKEN_INFRASTRUCTURE: t.feedback.tagBrokenInfrastructure,
    FREQUENCY: t.feedback.tagFrequency,
    ROUTE_COVERAGE: t.feedback.tagRouteCoverage,
  };

  return (
    <div className="bg-surface-raised rounded-lg shadow-md p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-yellow-400 text-sm">
          {"★".repeat(f.rating)}
          {"☆".repeat(5 - f.rating)}
        </span>
        {badge}
        {/* Author badges */}
        {f.authorBadges && f.authorBadges.length > 0 && (
          <span className="flex items-center gap-0.5">
            {f.authorBadges.map((bid) => {
              const b = BADGES[bid as BadgeId];
              if (!b) return null;
              return (
                <span
                  key={bid}
                  title={b.label}
                  className="text-sm cursor-default"
                  aria-label={b.label}
                >
                  {b.emoji}
                </span>
              );
            })}
          </span>
        )}
        <span className="text-xs text-content-muted">
          {new Date(f.createdAt).toLocaleDateString("pt-PT", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      {/* Tags */}
      {f.tags && f.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {f.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-sunken text-content-secondary"
            >
              {TAG_EMOJI[tag]} {tagLabels[tag]}
            </span>
          ))}
        </div>
      )}

      {f.comment && <p className="text-sm text-content-secondary mb-2">{f.comment}</p>}

      {/* Operator response */}
      {f.operatorResponse && (
        <div className="mt-2 mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-[var(--color-content)]">
              🏢 Official response
            </span>
            {f.operatorResponse.status !== "OPEN" && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[f.operatorResponse.status]}`}
              >
                {STATUS_LABEL[f.operatorResponse.status]}
              </span>
            )}
            <span className="ml-auto text-[10px] text-[var(--color-content-muted)]">
              {new Date(f.operatorResponse.updatedAt).toLocaleDateString("pt-PT", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <p className="text-xs text-[var(--color-content-secondary)]">
            {f.operatorResponse.message}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UpvoteButton
            feedbackId={f.id}
            voteCount={f.voteCount ?? 0}
            userVoted={f.userVoted ?? false}
          />
          {(f.voteCount ?? 0) > 0 && (
            <span className="text-xs text-content-muted">
              {t.feedback.helpfulCount(f.voteCount ?? 0)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {targetName && <ShareButton feedback={f} targetName={targetName} />}
          <ReportButton feedbackId={f.id} userReported={f.userReported} />
        </div>
      </div>

      <EscalationPrompt
        voteCount={f.voteCount ?? 0}
        type={f.type}
        targetId={f.targetId}
        rating={f.rating}
        comment={f.comment ?? null}
        tags={f.tags ?? []}
        createdAt={f.createdAt}
      />
    </div>
  );
}
