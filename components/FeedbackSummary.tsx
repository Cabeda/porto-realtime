"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";
import type { FeedbackSummaryData } from "@/lib/types";

interface FeedbackSummaryProps {
  summary: FeedbackSummaryData | undefined;
  onClick?: () => void;
  compact?: boolean;
}

/**
 * Inline rating pill that shows average rating + count.
 * Renders as a clickable pill if onClick is provided.
 */
export function FeedbackSummary({ summary, onClick, compact }: FeedbackSummaryProps) {
  const t = useTranslations().feedback;

  if (!summary || summary.count === 0) {
    if (!onClick) return null;
    // Show a "Rate" prompt when no ratings exist and it's clickable
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-accent bg-accent-subtle rounded-full hover:bg-accent-subtle transition-colors"
      >
        <span className="text-content-muted">☆</span>
        {t.rate}
      </button>
    );
  }

  const stars = Math.round(summary.avg);
  const displayAvg = summary.avg.toFixed(1);

  const content = (
    <>
      <span className="text-yellow-500 text-xs">
        {"★".repeat(stars)}
        {"☆".repeat(5 - stars)}
      </span>
      <span className="font-semibold">{displayAvg}</span>
      {!compact && (
        <span className="text-content-muted">
          ({t.ratings(summary.count)})
        </span>
      )}
    </>
  );

  const className = `inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${
    onClick
      ? "cursor-pointer bg-surface-sunken hover:bg-border transition-colors"
      : "bg-surface-sunken"
  } text-content-secondary`;

  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <span className={className}>{content}</span>;
}
