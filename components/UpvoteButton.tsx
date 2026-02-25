"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";

interface UpvoteButtonProps {
  feedbackId: string;
  voteCount: number;
  userVoted: boolean;
  onVoteChange?: (voted: boolean, newCount: number) => void;
}

export function UpvoteButton({
  feedbackId,
  voteCount,
  userVoted,
  onVoteChange,
}: UpvoteButtonProps) {
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

    // Optimistic update
    const prevVoted = voted;
    const prevCount = count;
    setVoted(!voted);
    setCount(voted ? count - 1 : count + 1);

    setIsLoading(true);
    try {
      const res = await fetch("/api/feedback/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId }),
      });

      if (!res.ok) {
        // Revert on error
        setVoted(prevVoted);
        setCount(prevCount);
        return;
      }

      const data = await res.json();
      setVoted(data.voted);
      setCount(data.voteCount);
      onVoteChange?.(data.voted, data.voteCount);
    } catch {
      // Revert on error
      setVoted(prevVoted);
      setCount(prevCount);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleVote}
        disabled={isLoading}
        className={`inline-flex flex-col items-center justify-center w-10 rounded-lg transition-colors ${
          voted ? "text-accent" : "text-content-muted hover:text-accent"
        } disabled:opacity-50`}
        title={!isAuthenticated ? t.feedback.loginToVote : t.feedback.helpful}
        aria-label={`${t.feedback.helpful} (${count})`}
      >
        <svg
          className={`w-5 h-5 transition-transform ${voted ? "scale-110" : ""}`}
          viewBox="0 0 24 24"
          fill={voted ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={voted ? 0 : 2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l-7 7h4v9h6v-9h4l-7-7z" />
        </svg>
        <span
          className={`text-xs font-semibold leading-tight ${voted ? "text-accent" : "text-content-muted"}`}
        >
          {count}
        </span>
      </button>
      {showAuthModal &&
        createPortal(
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => setShowAuthModal(false)}
          />,
          document.body
        )}
    </>
  );
}
