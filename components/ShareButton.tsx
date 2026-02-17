"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/hooks/useTranslations";
import type { FeedbackItem } from "@/lib/types";

interface ShareButtonProps {
  feedback: FeedbackItem;
  targetName: string;
}

export function ShareButton({ feedback, targetName }: ShareButtonProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  const shareText = `${targetName}: ${"★".repeat(feedback.rating)}${"☆".repeat(5 - feedback.rating)}${
    feedback.comment ? ` — "${feedback.comment}"` : ""
  }${feedback.voteCount ? ` (${feedback.voteCount} 👍)` : ""} #PortoMove`;

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/reviews/${feedback.type.toLowerCase().replace("_", "-")}?target=${encodeURIComponent(feedback.targetId)}`
    : "";

  const handleShare = async () => {
    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: t.feedback.shareTitle(targetName),
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or API not available — fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Last resort: select text
    }
  };

  return (
    <button
      onClick={handleShare}
      className="text-xs text-content-muted hover:text-accent transition-colors"
      title={t.feedback.share}
    >
      {copied ? `✓ ${t.feedback.shareCopied}` : `↗ ${t.feedback.share}`}
    </button>
  );
}
