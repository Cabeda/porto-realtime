"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export type PeriodValue = "today" | "7d" | "30d" | string; // string = YYYY-MM-DD

interface PeriodSelectorProps {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  presets?: readonly ("today" | "7d" | "30d")[];
  showDatePicker?: boolean;
}

const PRESET_LABELS: Record<string, string> = {
  today: "Today",
  "7d": "7 Days",
  "30d": "30 Days",
};

function isDateString(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function PeriodSelector({
  value,
  onChange,
  presets = ["today", "7d", "30d"],
  showDatePicker = true,
}: PeriodSelectorProps) {
  const [dateOpen, setDateOpen] = useState(false);
  const isCustomDate = isDateString(value);

  // Fetch available dates for the date picker max/min bounds
  const { data: datesData } = useSWR(
    showDatePicker ? "/api/analytics/available-dates" : null,
    fetcher
  );

  const today = new Date().toISOString().slice(0, 10);
  const minDate = datesData?.earliest || "2026-02-01";
  const maxDate = today;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {presets.map((p) => (
        <button
          key={p}
          onClick={() => {
            onChange(p);
            setDateOpen(false);
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            value === p
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-surface)] text-[var(--color-content-secondary)] hover:bg-[var(--color-border)]"
          }`}
        >
          {PRESET_LABELS[p]}
        </button>
      ))}

      {showDatePicker && (
        <>
          <button
            onClick={() => setDateOpen(!dateOpen)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              isCustomDate
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-content-secondary)] hover:bg-[var(--color-border)]"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {isCustomDate ? value : "Date"}
          </button>

          {dateOpen && (
            <input
              type="date"
              min={minDate}
              max={maxDate}
              value={isCustomDate ? value : ""}
              onChange={(e) => {
                if (e.target.value) {
                  onChange(e.target.value);
                  setDateOpen(false);
                }
              }}
              className="px-2 py-1.5 rounded-lg text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-content)]"
            />
          )}
        </>
      )}
    </div>
  );
}
