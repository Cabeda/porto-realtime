"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";

interface UpvoteButtonProps {
  feedbackId: string;
  voteCount: number;
  userVoted: boolean;
  onVoteChange?: (voted: boolean, newCount: number) => void;
}

export function UpvoteButton({ feedbackId, voteCount, userVoted, onVoteChange }: UpvoteButtonProps) {
  const t = useTranslations();
  const { isAuthenticated } = useAuth();
  const [voted, setVoted] = useState(userVoted);
  const [count, setCount] = useState(voteCount);
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleVote = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/feedback/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId }),
      });

      if (res.status === 400) {
        const data = await res.json();
        if (data.error?.includes("own review")) return;
      }

      if (!res.ok) return;

      const data = await res.json();
      setVoted(data.voted);
      setCount(data.voteCount);
      onVoteChange?.(data.voted, data.voteCount);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleVote}
        disabled={isLoading}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
          voted
            ? "bg-accent/15 text-accent"
            : "bg-surface-sunken text-content-muted hover:text-accent hover:bg-accent/10"
        } disabled:opacity-50`}
        title={!isAuthenticated ? t.feedback.loginToVote : voted ? t.feedback.helpful : t.feedback.helpful}
        aria-label={`${t.feedback.helpful} (${count})`}
      >
        <svg
          className="w-3.5 h-3.5"
          fill={voted ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z"
          />
        </svg>
        {count > 0 && <span>{count}</span>}
      </button>
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => setShowAuthModal(false)}
        />
      )}
    </>
  );
}
