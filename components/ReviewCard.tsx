"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";
import { UpvoteButton } from "@/components/UpvoteButton";
import type { FeedbackItem } from "@/lib/types";

interface ReviewCardProps {
  feedback: FeedbackItem;
  /** Optional extra badge (e.g. line context for vehicle reviews) */
  badge?: React.ReactNode;
}

export function ReviewCard({ feedback: f, badge }: ReviewCardProps) {
  const t = useTranslations();

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
      {f.comment && (
        <p className="text-sm text-content-secondary mb-2">{f.comment}</p>
      )}
      <div className="flex items-center justify-between">
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
    </div>
  );
}
