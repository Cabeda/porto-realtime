"use client";

import { useState } from "react";
import {
  getEscalationTier,
  buildComplaintContext,
  PORTAL_QUEIXA_URL,
  LIVRO_RECLAMACOES_URL,
  TIER2_THRESHOLD,
  TIER3_THRESHOLD,
} from "@/lib/escalation";

interface EscalationPromptProps {
  voteCount: number;
  type: string;
  targetId: string;
  rating: number;
  comment: string | null;
  tags: string[];
  createdAt: string;
}

export function EscalationPrompt({
  voteCount,
  type,
  targetId,
  rating,
  comment,
  tags,
  createdAt,
}: EscalationPromptProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const tier = getEscalationTier(voteCount);
  if (!tier) return null;

  const context = buildComplaintContext({
    type,
    targetId,
    rating,
    comment,
    tags,
    voteCount,
    createdAt,
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(context);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isTier3 = tier === 3;
  const threshold = isTier3 ? TIER3_THRESHOLD : TIER2_THRESHOLD;
  const url = isTier3 ? LIVRO_RECLAMACOES_URL : PORTAL_QUEIXA_URL;
  const urlLabel = isTier3 ? "Livro de Reclamações" : "Portal da Queixa";
  const description = isTier3
    ? "This issue has enough community support for a legally binding complaint. STCP must respond within 15 business days."
    : "This issue has enough community support to escalate to Portal da Queixa, where STCP actively responds.";

  return (
    <div
      className={`mt-3 rounded-lg border p-3 text-xs ${isTier3 ? "border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950/30" : "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30"}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left"
      >
        <span className="text-base">{isTier3 ? "⚖️" : "📢"}</span>
        <div className="flex-1">
          <span
            className={`font-semibold ${isTier3 ? "text-orange-700 dark:text-orange-300" : "text-blue-700 dark:text-blue-300"}`}
          >
            {voteCount} people agree — escalate to {urlLabel}
          </span>
          <span
            className={`ml-1 ${isTier3 ? "text-orange-600 dark:text-orange-400" : "text-blue-600 dark:text-blue-400"}`}
          >
            ({threshold}+ votes)
          </span>
        </div>
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isTier3 ? "text-orange-500" : "text-blue-500"} ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p
            className={`${isTier3 ? "text-orange-700 dark:text-orange-300" : "text-blue-700 dark:text-blue-300"}`}
          >
            {description}
          </p>

          {/* Pre-filled context */}
          <div>
            <p className="font-medium mb-1 text-[var(--color-content-secondary)]">
              Copy this context to paste into the form:
            </p>
            <div className="relative">
              <pre className="bg-[var(--color-surface-sunken)] rounded p-2 text-[10px] text-[var(--color-content-secondary)] whitespace-pre-wrap break-words leading-relaxed">
                {context}
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-1.5 right-1.5 px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isTier3
                ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            Open {urlLabel} →
          </a>
        </div>
      )}
    </div>
  );
}
