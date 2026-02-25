"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import { AuthModal } from "@/components/AuthModal";
import { TagSelector } from "@/components/TagSelector";
import type { FeedbackType, FeedbackItem, FeedbackMetadata, FeedbackTag } from "@/lib/types";

interface FeedbackFormProps {
  type: FeedbackType;
  targetId: string;
  targetName: string;
  /** Pre-existing feedback from the current user (for edit mode) */
  existingFeedback?: FeedbackItem | null;
  /** Optional metadata to attach (e.g. lineContext for vehicle feedback) */
  metadata?: FeedbackMetadata;
  onSuccess?: (feedback: FeedbackItem) => void;
}

export function FeedbackForm({
  type,
  targetId,
  targetName,
  existingFeedback,
  metadata,
  onSuccess,
}: FeedbackFormProps) {
  const t = useTranslations();
  const tf = t.feedback;
  const { isAuthenticated } = useAuth();
  const [rating, setRating] = useState(existingFeedback?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState(existingFeedback?.comment ?? "");
  const [selectedTags, setSelectedTags] = useState<FeedbackTag[]>(existingFeedback?.tags ?? []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isEditing = !!existingFeedback;
  const maxComment = 500;
  // Track pending submit after auth — avoids race condition where
  // isAuthenticated hasn't updated yet when handleAuthSuccess fires
  const pendingSubmitRef = useRef(false);

  // Reset form when target changes
  useEffect(() => {
    setRating(existingFeedback?.rating ?? 0);
    setComment(existingFeedback?.comment ?? "");
    setSelectedTags(existingFeedback?.tags ?? []);
    setMessage(null);
  }, [targetId, existingFeedback]);

  const doSubmit = async () => {
    if (rating === 0) return;

    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          targetId,
          rating,
          comment: comment.trim() || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          ...(metadata ? { metadata } : {}),
        }),
      });

      if (res.status === 429) {
        setMessage({ text: tf.rateLimited, type: "error" });
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to submit");
      }

      const data = await res.json();

      setMessage({ text: isEditing ? tf.updated : tf.success, type: "success" });
      onSuccess?.(data.feedback);
    } catch {
      setMessage({ text: tf.error, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (rating === 0) return;

    // If not authenticated, show auth modal instead of submitting
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    await doSubmit();
  };

  // After successful auth, mark pending submit — the effect below will fire it
  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    pendingSubmitRef.current = true;
  };

  // When auth state changes to authenticated and we have a pending submit, fire it
  useEffect(() => {
    if (isAuthenticated && pendingSubmitRef.current) {
      pendingSubmitRef.current = false;
      doSubmit();
    }
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Target label */}
      <div className="text-sm text-content-muted">
        {type === "LINE"
          ? tf.rateThisLine
          : type === "VEHICLE"
            ? tf.rateThisVehicle
            : type === "BIKE_PARK"
              ? tf.rateThisBikePark
              : type === "BIKE_LANE"
                ? tf.rateThisBikeLane
                : tf.rateThisStop}
        : <span className="font-semibold text-content">{targetName}</span>
        {type === "VEHICLE" && metadata?.lineContext && (
          <div className="text-xs text-content-muted mt-0.5">
            {tf.vehicleOnLine(metadata.lineContext)}
          </div>
        )}
      </div>

      {/* Star rating */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            className="text-3xl transition-transform hover:scale-110 active:scale-95 focus:outline-none"
            aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
          >
            <span
              className={star <= (hoverRating || rating) ? "text-yellow-400" : "text-content-muted"}
            >
              ★
            </span>
          </button>
        ))}
        {rating > 0 && <span className="ml-2 text-sm text-content-muted">{rating}/5</span>}
      </div>

      {/* Comment */}
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, maxComment))}
          placeholder={tf.commentPlaceholder}
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-content placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none text-sm"
        />
        <div className="text-xs text-content-muted text-right mt-1">
          {tf.characters(comment.length, maxComment)}
        </div>
      </div>

      {/* Issue tags */}
      <TagSelector selected={selectedTags} onChange={setSelectedTags} />

      {/* Auth hint for unauthenticated users */}
      {!isAuthenticated && rating > 0 && (
        <p className="text-xs text-content-muted text-center">{t.auth.loginToSubmit}</p>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={rating === 0 || isSubmitting}
        className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-content-inverse shadow-md active:scale-[0.98]"
      >
        {isSubmitting ? tf.submitting : isEditing ? tf.update : tf.submit}
      </button>

      {/* Feedback message */}
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

      {/* Auth modal — shown when unauthenticated user tries to submit */}
      {showAuthModal &&
        createPortal(
          <AuthModal onClose={() => setShowAuthModal(false)} onSuccess={handleAuthSuccess} />,
          document.body
        )}
    </div>
  );
}
