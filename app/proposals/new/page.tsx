"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { SettingsModal } from "@/components/SettingsModal";
import { UserMenu } from "@/components/UserMenu";
import { ProposalForm } from "@/components/ProposalForm";

export default function NewProposalPage() {
  const t = useTranslations();
  const tp = t.proposals;
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);

  const handleSuccess = (proposalId?: string) => {
    if (proposalId) {
      setCreatedId(proposalId);
    } else {
      // Fallback: redirect after delay if no ID returned
      setTimeout(() => router.push("/community?section=proposals"), 1500);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/community?section=proposals${createdId ? `&id=${createdId}` : ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: tp.createProposal, url });
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

  return (
    <div className="min-h-screen bg-surface-sunken transition-colors">
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <Link
              href="/community?section=proposals"
              className="inline-flex items-center text-accent hover:text-accent-hover font-medium text-sm transition-colors"
            >
              <span className="mr-2">&larr;</span>
              {tp.backToProposals}
            </Link>
            <div className="flex items-center gap-2">
              <UserMenu />
              <button
                onClick={() => setShowSettings(true)}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-surface-sunken hover:bg-border text-content-secondary transition-colors"
                title={t.nav.settings}
                aria-label={t.nav.settings}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-content">{tp.createProposal}</h1>
          <p className="text-sm text-content-muted mt-1">{tp.subtitle}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-20 sm:pb-6">
        {createdId ? (
          /* Success state (#3) — clear confirmation with share CTA */
          <div className="bg-surface-raised rounded-lg shadow-md p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-content mb-2">{tp.success}</h2>
            <p className="text-sm text-content-muted mb-6">{tp.proposalCreated}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleShare}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-accent text-content-inverse rounded-lg hover:bg-accent-hover transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {showCopied ? tp.linkCopied : tp.shareProposal}
              </button>
              <Link
                href="/community?section=proposals"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-surface-sunken text-content-secondary rounded-lg hover:bg-border transition-colors text-sm font-medium"
              >
                {tp.backToProposals}
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-surface-raised rounded-lg shadow-md p-5">
            <ProposalForm onSuccess={handleSuccess} />
          </div>
        )}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
