"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { getAnonymousId } from "@/lib/anonymous-id";
import type { FeedbackType, FeedbackItem, FeedbackMetadata } from "@/lib/types";

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
  const t = useTranslations().feedback;
  const [rating, setRating] = useState(existingFeedback?.rating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState(existingFeedback?.comment ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const isEditing = !!existingFeedback;
  const maxComment = 500;

  // Reset form when target changes
  useEffect(() => {
    setRating(existingFeedback?.rating ?? 0);
    setComment(existingFeedback?.comment ?? "");
    setMessage(null);
  }, [targetId, existingFeedback]);

  const handleSubmit = async () => {
    if (rating === 0) return;

    const anonId = getAnonymousId();
    if (!anonId) {
      setMessage({ text: t.error, type: "error" });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anonymous-id": anonId,
        },
        body: JSON.stringify({
          type,
          targetId,
          rating,
          comment: comment.trim() || undefined,
          ...(metadata ? { metadata } : {}),
        }),
      });

      if (res.status === 429) {
        setMessage({ text: t.rateLimited, type: "error" });
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to submit");
      }

      const data = await res.json();
      setMessage({ text: isEditing ? t.updated : t.success, type: "success" });
      onSuccess?.(data.feedback);
    } catch {
      setMessage({ text: t.error, type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Target label */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {type === "LINE" ? t.rateThisLine : type === "VEHICLE" ? t.rateThisVehicle : t.rateThisStop}:{" "}
        <span className="font-semibold text-gray-900 dark:text-white">{targetName}</span>
        {type === "VEHICLE" && metadata?.lineContext && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {t.vehicleOnLine(metadata.lineContext)}
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
              className={
                star <= (hoverRating || rating)
                  ? "text-yellow-400"
                  : "text-gray-300 dark:text-gray-600"
              }
            >
              ★
            </span>
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{rating}/5</span>
        )}
      </div>

      {/* Comment */}
      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, maxComment))}
          placeholder={t.commentPlaceholder}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
        />
        <div className="text-xs text-gray-400 dark:text-gray-500 text-right mt-1">
          {t.characters(comment.length, maxComment)}
        </div>
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={rating === 0 || isSubmitting}
        className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-[0.98]"
      >
        {isSubmitting ? t.submitting : isEditing ? t.update : t.submit}
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
    </div>
  );
}
