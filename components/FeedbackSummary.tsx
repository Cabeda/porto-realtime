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
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
      >
        <span className="text-gray-400 dark:text-gray-500">☆</span>
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
        <span className="text-gray-400 dark:text-gray-500">
          ({t.ratings(summary.count)})
        </span>
      )}
    </>
  );

  const className = `inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${
    onClick
      ? "cursor-pointer bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      : "bg-gray-100 dark:bg-gray-700"
  } text-gray-700 dark:text-gray-300`;

  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <span className={className}>{content}</span>;
}
