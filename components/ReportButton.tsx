"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";
import type { ReportReason } from "@/lib/types";

interface ReportButtonProps {
  feedbackId: string;
  userReported?: boolean;
}

const REASONS: ReportReason[] = ["SPAM", "OFFENSIVE", "MISLEADING", "OTHER"];

export function ReportButton({ feedbackId, userReported = false }: ReportButtonProps) {
  const t = useTranslations();
  const { isAuthenticated } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [reported, setReported] = useState(userReported);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reasonLabels: Record<ReportReason, string> = {
    SPAM: t.feedback.reportReasonSpam,
    OFFENSIVE: t.feedback.reportReasonOffensive,
    MISLEADING: t.feedback.reportReasonMisleading,
    OTHER: t.feedback.reportReasonOther,
  };

  const handleClick = () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    if (reported) return;
    setShowModal(true);
  };

  const handleReport = async (reason: ReportReason) => {
    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/feedback/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, reason }),
      });

      if (res.status === 429) {
        setMessage(t.feedback.reportRateLimited);
        return;
      }

      if (res.status === 400) {
        const data = await res.json();
        if (data.error?.includes("own")) {
          setMessage(t.feedback.cannotReportOwn);
          return;
        }
      }

      if (!res.ok) throw new Error("Failed");

      setReported(true);
      setMessage(t.feedback.reportSuccess);
      setTimeout(() => setShowModal(false), 1500);
    } catch {
      setMessage(t.feedback.reportError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={reported}
        className={`text-xs transition-colors ${
          reported ? "text-content-muted cursor-default" : "text-content-muted hover:text-red-500"
        }`}
        title={reported ? t.feedback.reported : t.feedback.report}
      >
        {reported ? "🚩 " + t.feedback.reported : "🚩"}
      </button>

      {showModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
            onClick={() => setShowModal(false)}
          >
            <div
              className="bg-surface rounded-xl shadow-xl p-5 mx-4 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-content mb-3">
                {t.feedback.reportTitle}
              </h3>
              <div className="space-y-2">
                {REASONS.map((reason) => (
                  <button
                    key={reason}
                    onClick={() => handleReport(reason)}
                    disabled={isSubmitting}
                    className="w-full text-left px-4 py-2.5 rounded-lg text-sm text-content hover:bg-surface-sunken transition-colors disabled:opacity-50"
                  >
                    {reasonLabels[reason]}
                  </button>
                ))}
              </div>
              {message && <p className="text-xs text-center mt-3 text-content-muted">{message}</p>}
              <button
                onClick={() => setShowModal(false)}
                className="w-full mt-3 py-2 text-sm text-content-muted hover:text-content transition-colors"
              >
                {t.auth.close}
              </button>
            </div>
          </div>,
          document.body
        )}

      {showAuthModal &&
        createPortal(
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => {
              setShowAuthModal(false);
              setShowModal(true);
            }}
          />,
          document.body
        )}
    </>
  );
}
