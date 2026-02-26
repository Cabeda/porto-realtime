"use client";

import { useTranslations } from "@/lib/hooks/useTranslations";
import type { FeedbackTag } from "@/lib/types";
import { FEEDBACK_TAGS } from "@/lib/types";

interface TagSelectorProps {
  selected: FeedbackTag[];
  onChange: (tags: FeedbackTag[]) => void;
}

const TAG_LABEL_MAP: Record<
  FeedbackTag,
  (t: ReturnType<typeof useTranslations>["feedback"]) => string
> = {
  OVERCROWDED: (t) => t.tagOvercrowded,
  LATE: (t) => t.tagLate,
  DIRTY: (t) => t.tagDirty,
  ACCESSIBILITY: (t) => t.tagAccessibility,
  SAFETY: (t) => t.tagSafety,
  BROKEN_INFRASTRUCTURE: (t) => t.tagBrokenInfrastructure,
  FREQUENCY: (t) => t.tagFrequency,
  ROUTE_COVERAGE: (t) => t.tagRouteCoverage,
};

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

export function TagSelector({ selected, onChange }: TagSelectorProps) {
  const t = useTranslations();

  const toggle = (tag: FeedbackTag) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  return (
    <div>
      <label className="text-xs text-content-muted block mb-1.5">{t.feedback.tags}</label>
      <div className="flex flex-wrap gap-1.5">
        {FEEDBACK_TAGS.map((tag) => {
          const isSelected = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                isSelected
                  ? "bg-accent text-content-inverse shadow-sm"
                  : "bg-surface-sunken text-content-secondary hover:bg-border"
              }`}
            >
              <span>{TAG_EMOJI[tag]}</span>
              <span>{TAG_LABEL_MAP[tag](t.feedback)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
