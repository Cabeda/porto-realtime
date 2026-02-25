"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useTranslations } from "@/lib/hooks/useTranslations";
import type { CheckInStats } from "@/lib/types";

const statsFetcher = async (url: string): Promise<CheckInStats> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
};

export function CommunityPulse() {
  const t = useTranslations();
  const [dismissed, setDismissed] = useState(false);

  const { data } = useSWR<CheckInStats>("/api/checkin/stats", statsFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  // Auto-show after a short delay so it doesn't flash on load
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (dismissed || !visible) return null;

  const activeCount = data?.total ?? 0;
  const todayCount = data?.todayTotal ?? 0;

  return (
    <div
      className="absolute top-16 right-3 z-[999] max-w-[220px] animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <button
        onClick={() => setDismissed(true)}
        className="w-full bg-surface-raised/90 backdrop-blur-sm border border-border rounded-xl shadow-lg px-3 py-2 text-left hover:bg-surface-raised transition-colors group"
        aria-label="Dismiss community pulse"
      >
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
          )}
          <p className="text-xs font-medium text-content leading-tight">
            {activeCount > 0 ? t.pulse.peopleUsing(activeCount) : t.pulse.beFirst}
          </p>
        </div>
        {todayCount > 0 && (
          <p className="text-[10px] text-content-muted mt-0.5 ml-[1.125rem]">
            {t.pulse.todayTotal(todayCount)}
          </p>
        )}
      </button>
    </div>
  );
}
