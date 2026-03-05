"use client";

import { BottomSheet } from "@/components/BottomSheet";
import { FeedbackForm } from "@/components/FeedbackForm";
import { useTranslations } from "@/lib/hooks/useTranslations";
import type {
  FeedbackType,
  FeedbackItem,
  FeedbackListResponse,
  FeedbackMetadata,
} from "@/lib/types";

interface FeedbackBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type: FeedbackType;
  targetId: string;
  targetName: string;
  feedbackList?: FeedbackListResponse | undefined;
  existingFeedback?: FeedbackItem | null;
  metadata?: FeedbackMetadata;
  onSuccess?: (feedback: FeedbackItem) => void;
}

export function FeedbackBottomSheet({
  isOpen,
  onClose,
  title,
  type,
  targetId,
  targetName,
  feedbackList,
  existingFeedback,
  metadata,
  onSuccess,
}: FeedbackBottomSheetProps) {
  const t = useTranslations();

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <FeedbackForm
        type={type}
        targetId={targetId}
        targetName={targetName}
        existingFeedback={existingFeedback}
        metadata={metadata}
        onSuccess={onSuccess}
      />
      {feedbackList && feedbackList.feedbacks.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-content-secondary mb-3">
            {t.feedback.recentComments}
          </h3>
          <div className="space-y-3">
            {feedbackList.feedbacks
              .filter((f) => f.comment)
              .slice(0, 5)
              .map((f) => (
                <div key={f.id} className="bg-surface-sunken rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-yellow-400 text-xs">
                      {"★".repeat(f.rating)}
                      {"☆".repeat(5 - f.rating)}
                    </span>
                    {f.metadata?.lineContext && (
                      <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium">
                        Linha {f.metadata.lineContext}
                      </span>
                    )}
                    <span className="text-xs text-content-muted">
                      {new Date(f.createdAt).toLocaleDateString("pt-PT")}
                    </span>
                  </div>
                  <p className="text-sm text-content-secondary">{f.comment}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
