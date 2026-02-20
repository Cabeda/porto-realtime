"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";
import type { ProposalItem, ProposalStatus, ReportReason } from "@/lib/types";

interface ProposalCardProps {
  proposal: ProposalItem;
  onVoteChange?: (id: string, voted: boolean, newCount: number) => void;
}

const TYPE_ICON: Record<string, string> = {
  BIKE_LANE: "🛤️",
  STOP: "🚏",
  LINE: "🚌",
};

const STATUS_COLORS: Record<ProposalStatus, string> = {
  OPEN: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  UNDER_REVIEW: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  CLOSED: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
  ARCHIVED: "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
};

const REPORT_REASONS: ReportReason[] = ["SPAM", "OFFENSIVE", "MISLEADING", "OTHER"];
const VOTE_THRESHOLD = 25;

export function ProposalCard({ proposal: p, onVoteChange }: ProposalCardProps) {
  const t = useTranslations();
  const tp = t.proposals;
  const { isAuthenticated } = useAuth();

  const [voted, setVoted] = useState(p.userVoted);
  const [voteCount, setVoteCount] = useState(p.voteCount);
  const [isVoting, setIsVoting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reported, setReported] = useState(p.userReported);
  const [isReporting, setIsReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  const [showCopied, setShowCopied] = useState(false);

  const statusLabel: Record<ProposalStatus, string> = {
    OPEN: tp.statusOpen,
    UNDER_REVIEW: tp.statusUnderReview,
    CLOSED: tp.statusClosed,
    ARCHIVED: tp.statusArchived,
  };

  const typeLabel: Record<string, string> = {
    BIKE_LANE: tp.typeBikeLane,
    STOP: tp.typeStop,
    LINE: tp.typeLine,
  };

  const reportReasonLabels: Record<ReportReason, string> = {
    SPAM: t.feedback.reportReasonSpam,
    OFFENSIVE: t.feedback.reportReasonOffensive,
    MISLEADING: t.feedback.reportReasonMisleading,
    OTHER: t.feedback.reportReasonOther,
  };

  const handleVote = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    const prevVoted = voted;
    const prevCount = voteCount;
    setVoted(!voted);
    setVoteCount(voted ? voteCount - 1 : voteCount + 1);

    // Bounce animation on upvote
    if (!voted) {
      setJustVoted(true);
      setTimeout(() => setJustVoted(false), 600);
    }

    setIsVoting(true);
    try {
      const res = await fetch("/api/proposals/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: p.id }),
      });

      if (!res.ok) {
        setVoted(prevVoted);
        setVoteCount(prevCount);
        return;
      }

      const data = await res.json();
      setVoted(data.voted);
      setVoteCount(data.voteCount);
      onVoteChange?.(p.id, data.voted, data.voteCount);
    } catch {
      setVoted(prevVoted);
      setVoteCount(prevCount);
    } finally {
      setIsVoting(false);
    }
  };

  const handleReport = async (reason: ReportReason) => {
    setIsReporting(true);
    setReportMessage(null);

    try {
      const res = await fetch("/api/proposals/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: p.id, reason }),
      });

      if (res.status === 429) {
        setReportMessage(t.feedback.reportRateLimited);
        return;
      }

      if (res.status === 400) {
        const data = await res.json();
        if (data.error?.includes("own")) {
          setReportMessage(tp.cannotReportOwn);
          return;
        }
      }

      if (!res.ok) throw new Error("Failed");

      setReported(true);
      setReportMessage(tp.reportSuccess);
      setTimeout(() => setShowReportModal(false), 1500);
    } catch {
      setReportMessage(tp.reportError);
    } finally {
      setIsReporting(false);
    }
  };

  const handleReportClick = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    if (reported) return;
    setShowReportModal(true);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/community?section=proposals&id=${p.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: p.title, url });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Progress toward UNDER_REVIEW threshold
  const progress = Math.min(voteCount / VOTE_THRESHOLD, 1);
  const showProgress = p.status === "OPEN";
  const isDescriptionLong = p.description.length > 180;

  return (
    <>
      <div className="bg-surface-raised rounded-lg shadow-md p-4">
        {/* Header: type badge + status + date */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-sunken text-content-secondary">
            {TYPE_ICON[p.type]} {typeLabel[p.type]}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
            {statusLabel[p.status]}
          </span>
          {p.targetId && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
              {p.targetId}
            </span>
          )}
          <span className="text-xs text-content-muted ml-auto">
            {new Date(p.createdAt).toLocaleDateString("pt-PT", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-content mb-1">{p.title}</h3>

        {/* Description (expandable) */}
        <div className="mb-3">
          <p
            className={`text-sm text-content-secondary ${
              !expanded && isDescriptionLong ? "line-clamp-3" : ""
            }`}
          >
            {p.description}
          </p>
          {isDescriptionLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-accent hover:text-accent-hover font-medium mt-1 transition-colors"
            >
              {expanded ? tp.showLess : tp.showMore}
            </button>
          )}
        </div>

        {/* Under review banner (improved) */}
        {p.status === "UNDER_REVIEW" && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-medium flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {tp.underReviewBanner}
          </div>
        )}

        {/* Vote progress bar (#1) */}
        {showProgress && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-content-muted">
                {progress >= 1
                  ? tp.progressComplete
                  : tp.progressLabel(voteCount, VOTE_THRESHOLD)}
              </span>
            </div>
            <div className="w-full h-1.5 bg-surface-sunken rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  progress >= 1
                    ? "bg-green-500"
                    : progress >= 0.6
                      ? "bg-amber-400"
                      : "bg-accent"
                }`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Link */}
        {p.linkUrl && (
          <a
            href={p.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent-hover font-medium mb-3 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {tp.moreDetails}
          </a>
        )}

        {/* Footer: vote + share + report */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Vote button with bounce animation (#9) */}
            <button
              onClick={handleVote}
              disabled={isVoting}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                voted
                  ? "bg-accent/10 text-accent"
                  : "bg-surface-sunken text-content-muted hover:text-accent hover:bg-accent/10"
              } disabled:opacity-50`}
              aria-label={`${tp.voteCount(voteCount)}`}
            >
              <svg
                className={`w-4 h-4 transition-transform ${voted ? "scale-110" : ""} ${justVoted ? "animate-bounce" : ""}`}
                viewBox="0 0 24 24"
                fill={voted ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={voted ? 0 : 2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4l-7 7h4v9h6v-9h4l-7-7z" />
              </svg>
              {voteCount}
            </button>
            {voteCount > 0 && (
              <span className="text-xs text-content-muted">
                {tp.supporters(voteCount)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Share button (#6) */}
            <button
              onClick={handleShare}
              className="text-xs text-content-muted hover:text-accent transition-colors inline-flex items-center gap-1"
              title={tp.shareProposal}
            >
              {showCopied ? (
                <span className="text-green-600 dark:text-green-400">{tp.linkCopied}</span>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span className="hidden sm:inline">{tp.shareProposal}</span>
                </>
              )}
            </button>
            {/* Report button */}
            <button
              onClick={handleReportClick}
              disabled={reported}
              className={`text-xs transition-colors ${
                reported
                  ? "text-content-muted cursor-default"
                  : "text-content-muted hover:text-red-500"
              }`}
              title={reported ? tp.reported : tp.report}
            >
              {reported ? "🚩 " + tp.reported : "🚩"}
            </button>
          </div>
        </div>
      </div>

      {/* Report modal */}
      {showReportModal && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
          onClick={() => setShowReportModal(false)}
        >
          <div
            className="bg-surface rounded-xl shadow-xl p-5 mx-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-content mb-3">{tp.reportTitle}</h3>
            <div className="space-y-2">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => handleReport(reason)}
                  disabled={isReporting}
                  className="w-full text-left px-4 py-2.5 rounded-lg text-sm text-content hover:bg-surface-sunken transition-colors disabled:opacity-50"
                >
                  {reportReasonLabels[reason]}
                </button>
              ))}
            </div>
            {reportMessage && (
              <p className="text-xs text-center mt-3 text-content-muted">{reportMessage}</p>
            )}
            <button
              onClick={() => setShowReportModal(false)}
              className="w-full mt-3 py-2 text-sm text-content-muted hover:text-content transition-colors"
            >
              {t.auth.close}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Auth modal */}
      {showAuthModal && createPortal(
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => setShowAuthModal(false)}
        />,
        document.body
      )}
    </>
  );
}
