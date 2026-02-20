"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";
import type { ProposalType } from "@/lib/types";

interface ProposalFormProps {
  onSuccess?: (proposalId?: string) => void;
}

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;

const TYPES: { key: ProposalType; icon: string }[] = [
  { key: "BIKE_LANE", icon: "🛤️" },
  { key: "STOP", icon: "🚏" },
  { key: "LINE", icon: "🚌" },
];

export function ProposalForm({ onSuccess }: ProposalFormProps) {
  const t = useTranslations();
  const tp = t.proposals;
  const { isAuthenticated } = useAuth();

  const [type, setType] = useState<ProposalType>("LINE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetId, setTargetId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const pendingSubmitRef = useRef(false);

  const typeLabels: Record<ProposalType, string> = {
    BIKE_LANE: tp.typeBikeLane,
    STOP: tp.typeStop,
    LINE: tp.typeLine,
  };

  const typeDescs: Record<ProposalType, string> = {
    BIKE_LANE: tp.typeBikeLaneDesc,
    STOP: tp.typeStopDesc,
    LINE: tp.typeLineDesc,
  };

  const doSubmit = async () => {
    if (!title.trim() || description.trim().length < 20) return;

    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          description: description.trim(),
          targetId: targetId.trim() || undefined,
          linkUrl: linkUrl.trim() || undefined,
        }),
      });

      if (res.status === 429) {
        setMessage({ text: tp.rateLimited, type: "error" });
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setMessage({ text: data.error || tp.error, type: "error" });
        return;
      }

      const result = await res.json();
      setMessage({ text: tp.success, type: "success" });
      setTitle("");
      setDescription("");
      setTargetId("");
      setLinkUrl("");
      onSuccess?.(result.proposal?.id);
    } catch {
      setMessage({ text: tp.error, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || description.trim().length < 20) return;

    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    await doSubmit();
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    pendingSubmitRef.current = true;
  };

  useEffect(() => {
    if (isAuthenticated && pendingSubmitRef.current) {
      pendingSubmitRef.current = false;
      doSubmit();
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {/* Type selector */}
      <div>
        <label className="block text-sm font-medium text-content-secondary mb-2">
          {tp.proposalType}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors text-center ${
                type === t.key
                  ? "border-accent bg-accent/5 text-accent"
                  : "border-border bg-surface text-content-secondary hover:border-content-muted"
              }`}
            >
              <span className="text-xl">{t.icon}</span>
              <span className="text-xs font-medium">{typeLabels[t.key]}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-content-muted mt-1.5">{typeDescs[type]}</p>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-content-secondary mb-1">
          {tp.titleLabel}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
          placeholder={tp.titlePlaceholder}
          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
        <div className="text-xs text-content-muted text-right mt-1">
          {title.length}/{MAX_TITLE}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-content-secondary mb-1">
          {tp.descriptionLabel}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
          placeholder={tp.descriptionPlaceholder}
          rows={5}
          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none text-sm"
        />
        <div className="flex justify-between text-xs text-content-muted mt-1">
          <span>{description.trim().length < 20 ? tp.descriptionMinLength : ""}</span>
          <span>{description.length}/{MAX_DESCRIPTION}</span>
        </div>
      </div>

      {/* Target (optional) */}
      <div>
        <label className="block text-sm font-medium text-content-secondary mb-1">
          {tp.targetLabel}
        </label>
        <input
          type="text"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value.slice(0, 100))}
          placeholder={tp.targetPlaceholder}
          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
      </div>

      {/* Link (optional) */}
      <div>
        <label className="block text-sm font-medium text-content-secondary mb-1">
          {tp.linkLabel}
        </label>
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value.slice(0, 500))}
          placeholder={tp.linkPlaceholder}
          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent text-sm"
        />
        <p className="text-xs text-content-muted mt-1">{tp.linkHelp}</p>
      </div>

      {/* Auth hint */}
      {!isAuthenticated && title.trim().length > 0 && (
        <p className="text-xs text-content-muted text-center">
          {tp.loginRequired}
        </p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!title.trim() || description.trim().length < 20 || isSubmitting}
        className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
      >
        {isSubmitting ? tp.submitting : tp.submit}
      </button>

      {/* Message */}
      {message && (
        <div
          className={`text-sm text-center py-2 px-3 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
              : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Auth modal */}
      {showAuthModal && createPortal(
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />,
        document.body
      )}
    </div>
  );
}
