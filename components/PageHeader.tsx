"use client";

import { useState } from "react";
import Link from "next/link";
import { DesktopNav } from "@/components/DesktopNav";
import { UserMenu } from "@/components/UserMenu";
import { SettingsModal } from "@/components/SettingsModal";
import { useTranslations } from "@/lib/hooks/useTranslations";

interface PageHeaderProps {
  title: string;
  /** Optional back link URL (renders a left arrow before the title) */
  backHref?: string;
  /** Max-width class for the header content (default: "max-w-7xl") */
  maxWidth?: string;
}

export function PageHeader({ title, backHref, maxWidth = "max-w-7xl" }: PageHeaderProps) {
  const t = useTranslations();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <header className="bg-surface-raised shadow-sm border-b border-border sticky top-0 z-10">
        <div className={`${maxWidth} mx-auto px-4 py-3 flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-3 shrink-0">
            {backHref && (
              <Link href={backHref} className="text-sm text-accent hover:text-accent-hover">
                &larr;
              </Link>
            )}
            <h1 className="text-xl font-bold text-content">{title}</h1>
          </div>
          <DesktopNav />
          <div className="flex items-center gap-2">
            <UserMenu />
            <button
              onClick={() => setShowSettings(true)}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-surface-sunken hover:bg-border text-content-secondary transition-colors"
              title={t.nav.settings}
              aria-label={t.nav.settings}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
