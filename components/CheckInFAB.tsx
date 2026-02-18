"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import type { TransitMode, CheckInItem } from "@/lib/types";

const MODE_OPTIONS: { mode: TransitMode; emoji: string; key: keyof ReturnType<typeof import("@/lib/hooks/useTranslations").useTranslations>["checkin"] }[] = [
  { mode: "BUS", emoji: "🚌", key: "bus" },
  { mode: "METRO", emoji: "🚇", key: "metro" },
  { mode: "BIKE", emoji: "🚲", key: "bike" },
  { mode: "WALK", emoji: "🚶", key: "walk" },
  { mode: "SCOOTER", emoji: "🛴", key: "scooter" },
];

export function CheckInFAB() {
  const t = useTranslations();
  const { isAuthenticated } = useAuth();
  const [showPicker, setShowPicker] = useState(false);
  const [activeCheckIn, setActiveCheckIn] = useState<CheckInItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Fetch current check-in on mount (auth users only — anonymous can't retrieve theirs)
  const fetchCurrent = useCallback(async () => {
    try {
      const res = await fetch("/api/checkin");
      if (res.ok) {
        const data = await res.json();
        setActiveCheckIn(data.checkIn ?? null);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchCurrent();
  }, [isAuthenticated, fetchCurrent]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Minutes remaining on active check-in
  const minutesLeft = activeCheckIn
    ? Math.max(0, Math.round((new Date(activeCheckIn.expiresAt).getTime() - Date.now()) / 60000))
    : 0;

  // Auto-clear expired check-in
  useEffect(() => {
    if (activeCheckIn && minutesLeft <= 0) setActiveCheckIn(null);
  }, [activeCheckIn, minutesLeft]);

  // Check-in handler — works for both anonymous and authenticated users
  // lat/lon are target infrastructure coordinates (bus stop, bike park), NOT user GPS
  const handleCheckIn = useCallback(async (mode: TransitMode, targetId?: string, targetLat?: number, targetLon?: number) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, targetId, lat: targetLat, lon: targetLon }),
      });
      if (res.ok) {
        const data = await res.json();
        // Only track active check-in state for authenticated users (they can end it)
        if (isAuthenticated) {
          setActiveCheckIn(data.checkIn);
        }
        setToast(t.checkin.checkInSuccess);
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || t.checkin.checkInError);
      }
    } catch {
      setToast(t.checkin.checkInError);
    } finally {
      setIsLoading(false);
      setShowPicker(false);
    }
  }, [t, isAuthenticated]);

  const handleEndCheckIn = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/checkin", { method: "DELETE" });
      setActiveCheckIn(null);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleFABClick = () => {
    if (activeCheckIn && isAuthenticated) {
      handleEndCheckIn();
    } else {
      setShowPicker(true);
    }
  };

  // Listen for check-in requests from bus popups (no auth required)
  useEffect(() => {
    const handleBusCheckIn = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.routeShortName) {
        handleCheckIn("BUS", detail.routeShortName);
      }
    };
    window.addEventListener("open-bus-checkin", handleBusCheckIn);
    return () => window.removeEventListener("open-bus-checkin", handleBusCheckIn);
  }, [handleCheckIn]);

  // Listen for check-in requests from bike lane popups (no auth required)
  useEffect(() => {
    const handleBikeCheckIn = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.laneName) {
        const lat = detail.lat ? parseFloat(detail.lat) : undefined;
        const lon = detail.lon ? parseFloat(detail.lon) : undefined;
        handleCheckIn("BIKE", detail.laneName, lat, lon);
      }
    };
    window.addEventListener("open-bike-checkin", handleBikeCheckIn);
    return () => window.removeEventListener("open-bike-checkin", handleBikeCheckIn);
  }, [handleCheckIn]);

  // Listen for check-in requests from bike park popups (no auth required)
  useEffect(() => {
    const handleBikeParkCheckIn = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.parkName) {
        const lat = detail.lat ? parseFloat(detail.lat) : undefined;
        const lon = detail.lon ? parseFloat(detail.lon) : undefined;
        handleCheckIn("BIKE", detail.parkName, lat, lon);
      }
    };
    window.addEventListener("open-bike-park-checkin", handleBikeParkCheckIn);
    return () => window.removeEventListener("open-bike-park-checkin", handleBikeParkCheckIn);
  }, [handleCheckIn]);

  const modeEmoji = activeCheckIn
    ? MODE_OPTIONS.find((m) => m.mode === activeCheckIn.mode)?.emoji ?? "🚏"
    : null;

  return (
    <>
      {/* FAB — stacked above the location button on the right */}
      <button
        onClick={handleFABClick}
        disabled={isLoading}
        className={`absolute right-4 z-[1001] w-12 h-12 rounded-full shadow-lg border-2 flex items-center justify-center transition-all disabled:opacity-50 ${
          activeCheckIn
            ? "bg-green-500 border-green-600 text-white animate-pulse"
            : "bg-accent border-accent text-white hover:brightness-110"
        }`}
        style={{ bottom: "calc(var(--bottom-nav-height) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px) + 3.5rem)" }}
        title={activeCheckIn ? t.checkin.endCheckIn : t.checkin.checkIn}
        aria-label={activeCheckIn ? `${t.checkin.activeCheckIn} — ${t.checkin.minutesLeft(minutesLeft)}` : t.checkin.checkIn}
      >
        {activeCheckIn ? (
          <span className="text-xl leading-none">{modeEmoji}</span>
        ) : (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
            <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" />
            <path d="M12 8v6" />
            <path d="M9 11h6" />
          </svg>
        )}
      </button>

      {/* Active check-in badge (auth users only — they can end it) */}
      {activeCheckIn && isAuthenticated && minutesLeft > 0 && (
        <div
          className="absolute right-[3.75rem] z-[1001] bg-green-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow whitespace-nowrap"
          style={{ bottom: "calc(var(--bottom-nav-height) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px) + 4.375rem)" }}
        >
          {t.checkin.minutesLeft(minutesLeft)}
        </div>
      )}

      {/* Mode picker popover */}
      {showPicker && createPortal(
        <div className="fixed inset-0 z-[2000]" onClick={() => setShowPicker(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute right-4 bg-surface-raised rounded-2xl shadow-xl p-3 flex flex-col gap-2 min-w-[180px] animate-fade-in"
            style={{ bottom: "calc(var(--bottom-nav-height) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px) + 7rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-content-secondary px-1 mb-1">{t.checkin.selectMode}</p>
            {MODE_OPTIONS.map(({ mode, emoji, key }) => (
              <button
                key={mode}
                onClick={() => handleCheckIn(mode)}
                disabled={isLoading}
                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-sunken transition-colors text-left disabled:opacity-50"
              >
                <span className="text-xl">{emoji}</span>
                <span className="text-sm font-medium text-content">{t.checkin[key] as string}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && createPortal(
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[3000] bg-surface-raised text-content text-sm font-medium px-4 py-2 rounded-xl shadow-lg border border-border animate-fade-in">
          {toast}
        </div>,
        document.body
      )}
    </>
  );
}
