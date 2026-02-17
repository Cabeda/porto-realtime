"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";
import { UpvoteButton } from "@/components/UpvoteButton";
import { ReportButton } from "@/components/ReportButton";
import { ShareButton } from "@/components/ShareButton";
import type { FeedbackItem, FeedbackTag } from "@/lib/types";

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
          {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
        </span>
        {badge}
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

      {f.comment && (
        <p className="text-sm text-content-secondary mb-2">{f.comment}</p>
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
    </div>
  );
}
