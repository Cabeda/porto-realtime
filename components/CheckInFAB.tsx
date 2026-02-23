"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { useAuth } from "@/lib/hooks/useAuth";
import type { TransitMode, CheckInItem, Bus, Stop, BikePark, BikeLane } from "@/lib/types";

const MODE_OPTIONS: { mode: TransitMode; emoji: string; key: keyof ReturnType<typeof import("@/lib/hooks/useTranslations").useTranslations>["checkin"] }[] = [
  { mode: "BUS", emoji: "🚌", key: "bus" },
  { mode: "METRO", emoji: "🚇", key: "metro" },
  { mode: "BIKE", emoji: "🚲", key: "bike" },
];

/** Haversine distance in meters between two [lat, lon] points */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Max distance (meters) to consider a target "nearby" */
const MAX_NEARBY_BUS_METRO = 1000;
const MAX_NEARBY_BIKE = 500;

interface NearbyCandidate {
  targetId: string;
  lat: number;
  lon: number;
  label: string;
  emoji: string;
  distance: number;
  priority: number; // lower = shown first (0 = live/primary, 1 = static/fallback)
}

interface CheckInFABProps {
  userLocation?: [number, number] | null;
  buses?: Bus[];
  stops?: Stop[];
  bikeParks?: BikePark[];
  bikeLanes?: BikeLane[];
  onLocationAcquired?: (loc: [number, number]) => void;
}

/**
 * Find nearby infrastructure candidates for a given transit mode.
 * Returns sorted list of candidates within proximity radius.
 * For BIKE: returns both bike parks and bike lanes so the UI can show a sub-picker if ambiguous.
 * For BUS/METRO: returns nearest stop/bus.
 * For WALK/SCOOTER: returns user location directly.
 */
function findNearbyCandidates(
  mode: TransitMode,
  userLat: number,
  userLon: number,
  buses: Bus[],
  stops: Stop[],
  bikeParks: BikePark[],
  bikeLanes: BikeLane[],
  t: ReturnType<typeof import("@/lib/hooks/useTranslations").useTranslations>,
): NearbyCandidate[] {
  const candidates: NearbyCandidate[] = [];

  if (mode === "BUS") {
    // Live buses — show each individual bus (unique by FIWARE id)
    for (const bus of buses) {
      const dist = haversineMeters(userLat, userLon, bus.lat, bus.lon);
      if (dist <= MAX_NEARBY_BUS_METRO) {
        const destination = bus.routeLongName ? ` → ${bus.routeLongName}` : "";
        const vehicleLabel = bus.vehicleNumber ? ` (#${bus.vehicleNumber})` : "";
        candidates.push({ targetId: bus.id, lat: bus.lat, lon: bus.lon, label: `${t.checkin.bus} ${bus.routeShortName}${vehicleLabel}${destination}`, emoji: "🚌", distance: dist, priority: 0 });
      }
    }
    // Bus stops as fallback
    for (const stop of stops) {
      if (!stop.vehicleMode || stop.vehicleMode === "BUS") {
        const dist = haversineMeters(userLat, userLon, stop.lat, stop.lon);
        if (dist <= MAX_NEARBY_BUS_METRO) {
          candidates.push({ targetId: stop.gtfsId, lat: stop.lat, lon: stop.lon, label: t.checkin.nearestStop(stop.name), emoji: "🚏", distance: dist, priority: 1 });
        }
      }
    }
  } else if (mode === "METRO") {
    for (const stop of stops) {
      if (stop.vehicleMode === "SUBWAY" || stop.vehicleMode === "TRAM" || stop.vehicleMode === "RAIL") {
        const dist = haversineMeters(userLat, userLon, stop.lat, stop.lon);
        if (dist <= MAX_NEARBY_BUS_METRO) {
          candidates.push({ targetId: stop.gtfsId, lat: stop.lat, lon: stop.lon, label: t.checkin.nearestStop(stop.name), emoji: "🚇", distance: dist, priority: 0 });
        }
      }
    }
    // Fall back to any stop if no metro stops found
    if (candidates.length === 0) {
      for (const stop of stops) {
        const dist = haversineMeters(userLat, userLon, stop.lat, stop.lon);
        if (dist <= MAX_NEARBY_BUS_METRO) {
          candidates.push({ targetId: stop.gtfsId, lat: stop.lat, lon: stop.lon, label: t.checkin.nearestStop(stop.name), emoji: "🚏", distance: dist, priority: 1 });
        }
      }
    }
  } else if (mode === "BIKE") {
    for (const park of bikeParks) {
      const dist = haversineMeters(userLat, userLon, park.lat, park.lon);
      if (dist <= MAX_NEARBY_BIKE) {
        candidates.push({ targetId: park.id, lat: park.lat, lon: park.lon, label: t.checkin.nearestBikePark(park.name), emoji: "🅿️", distance: dist, priority: 1 });
      }
    }
    for (const lane of bikeLanes) {
      if (lane.segments.length > 0) {
        // Find closest point on any segment
        let bestDist = Infinity;
        let bestLat = 0;
        let bestLon = 0;
        for (const seg of lane.segments) {
          for (const coord of seg) {
            const d = haversineMeters(userLat, userLon, coord[1], coord[0]);
            if (d < bestDist) { bestDist = d; bestLat = coord[1]; bestLon = coord[0]; }
          }
        }
        if (bestDist <= MAX_NEARBY_BIKE) {
          candidates.push({ targetId: lane.name, lat: bestLat, lon: bestLon, label: lane.name, emoji: "🛤️", distance: bestDist, priority: 0 });
        }
      }
    }
    // Always offer "cycling here" at user's location — signals demand for bike infrastructure
    // lat/lon NOT sent to API (privacy) — shown client-side only via userLocation prop
    candidates.push({ targetId: "bike-here", lat: 0, lon: 0, label: t.checkin.cyclingHere, emoji: "🚲", distance: 0, priority: 2 });
  }

  // Sort by priority first (live/primary before static/fallback), then by distance
  candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
  return candidates;
}

/** localStorage key for anonymous check-in tracking */
const ANON_CHECKIN_KEY = "anon_active_checkin";

/** Save anonymous check-in to localStorage so we can show active state */
function saveAnonCheckIn(checkIn: CheckInItem) {
  try {
    localStorage.setItem(ANON_CHECKIN_KEY, JSON.stringify(checkIn));
  } catch { /* quota exceeded — non-critical */ }
}

/** Load anonymous check-in from localStorage, clearing if expired */
function loadAnonCheckIn(): CheckInItem | null {
  try {
    const raw = localStorage.getItem(ANON_CHECKIN_KEY);
    if (!raw) return null;
    const checkIn = JSON.parse(raw) as CheckInItem;
    if (new Date(checkIn.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(ANON_CHECKIN_KEY);
      return null;
    }
    return checkIn;
  } catch {
    return null;
  }
}

function clearAnonCheckIn() {
  try { localStorage.removeItem(ANON_CHECKIN_KEY); } catch { /* ignore */ }
}

export function CheckInFAB({ userLocation, buses = [], stops = [], bikeParks = [], bikeLanes = [], onLocationAcquired }: CheckInFABProps) {
  const t = useTranslations();
  const { isAuthenticated } = useAuth();
  const [showPicker, setShowPicker] = useState(false);
  const [nearbyCandidates, setNearbyCandidates] = useState<NearbyCandidate[]>([]);
  const [selectedMode, setSelectedMode] = useState<TransitMode | null>(null);
  const [activeCheckIn, setActiveCheckIn] = useState<CheckInItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [acquiredLocation, setAcquiredLocation] = useState<[number, number] | null>(null);

  // Use prop location if available, otherwise use self-acquired location
  const effectiveLocation = userLocation || acquiredLocation;

  // Fetch current check-in on mount
  // Auth users: GET /api/checkin
  // Anon users: load from localStorage
  const fetchCurrent = useCallback(async () => {
    if (isAuthenticated) {
      try {
        const res = await fetch("/api/checkin");
        if (res.ok) {
          const data = await res.json();
          setActiveCheckIn(data.checkIn ?? null);
        }
      } catch {
        // ignore
      }
    } else {
      setActiveCheckIn(loadAnonCheckIn());
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchCurrent();
  }, [fetchCurrent]);

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
    if (activeCheckIn && minutesLeft <= 0) {
      setActiveCheckIn(null);
      if (!isAuthenticated) clearAnonCheckIn();
    }
  }, [activeCheckIn, minutesLeft, isAuthenticated]);

  // Check-in handler — works for both anonymous and authenticated users
  // lat/lon are infrastructure coords (stop, bike park); null for bike-here (privacy)
  const handleCheckIn = useCallback(async (mode: TransitMode, targetId?: string, lat?: number, lon?: number) => {
    // Block if anon user already has an active check-in (client-side guard)
    if (!isAuthenticated && activeCheckIn) {
      setToast(t.checkin.alreadyCheckedIn);
      return;
    }

    setIsLoading(true);
    // Dispatch optimistic event immediately so the map updates before the API responds
    window.dispatchEvent(new CustomEvent("checkin-changed", {
      detail: { mode, targetId, lat, lon, action: "add" },
    }));
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, targetId, lat, lon }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveCheckIn(data.checkIn);
        // Persist anon check-in to localStorage so it survives page refresh
        if (!isAuthenticated) {
          saveAnonCheckIn(data.checkIn);
        }
        setToast(t.checkin.checkInSuccess);
        // Revalidate server data — s-maxage=0 ensures fresh response
        window.dispatchEvent(new CustomEvent("checkin-confirmed"));
      } else {
        const data = await res.json().catch(() => ({}));
        // Handle specific "already checked in" error from API
        if (data.error === "ALREADY_CHECKED_IN") {
          setToast(t.checkin.alreadyCheckedIn);
        } else {
          setToast(data.error || t.checkin.checkInError);
        }
        // Revert optimistic update on failure
        window.dispatchEvent(new CustomEvent("checkin-changed", {
          detail: { mode, targetId, action: "remove" },
        }));
      }
    } catch {
      setToast(t.checkin.checkInError);
      // Revert optimistic update on failure
      window.dispatchEvent(new CustomEvent("checkin-changed", {
        detail: { mode, targetId, action: "remove" },
      }));
    } finally {
      setIsLoading(false);
      setShowPicker(false);
      setNearbyCandidates([]);
      setSelectedMode(null);
    }
  }, [t, isAuthenticated, activeCheckIn]);

  /** Request geolocation and resolve with coordinates, or null on failure */
  const requestLocation = useCallback((): Promise<[number, number] | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setToast(t.checkin.locationRequired);
        resolve(null);
        return;
      }
      setIsLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setAcquiredLocation(loc);
          onLocationAcquired?.(loc);
          setIsLoading(false);
          resolve(loc);
        },
        () => {
          setToast(t.checkin.locationRequired);
          setIsLoading(false);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });
  }, [t, onLocationAcquired]);

  /** Handle mode selection from the FAB picker — finds nearest target automatically */
  const handleModeSelect = useCallback(async (mode: TransitMode) => {
    let loc = effectiveLocation;

    // Auto-request location if not available
    if (!loc) {
      loc = await requestLocation();
      if (!loc) {
        setShowPicker(false);
        return;
      }
    }

    const candidates = findNearbyCandidates(mode, loc[0], loc[1], buses, stops, bikeParks, bikeLanes, t);

    if (candidates.length === 0) {
      setToast(t.checkin.noNearbyTarget);
      setShowPicker(false);
      return;
    }

    // Show sub-picker with nearby candidates (priority-sorted: live first, then static)
    setNearbyCandidates(candidates.slice(0, 5));
    setSelectedMode(mode);
  }, [effectiveLocation, requestLocation, buses, stops, bikeParks, bikeLanes, t, handleCheckIn]);

  const handleEndCheckIn = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/checkin", { method: "DELETE" });
      const endedMode = activeCheckIn?.mode;
      const endedTarget = activeCheckIn?.targetId;
      setActiveCheckIn(null);
      // Optimistic removal — map updates immediately via checkin-changed
      window.dispatchEvent(new CustomEvent("checkin-changed", {
        detail: { mode: endedMode, targetId: endedTarget, action: "remove" },
      }));
      // Revalidate server data — s-maxage=0 ensures fresh response
      window.dispatchEvent(new CustomEvent("checkin-confirmed"));
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleFABClick = () => {
    if (activeCheckIn) {
      if (isAuthenticated) {
        // Auth users can end their check-in
        handleEndCheckIn();
      } else {
        // Anon users can't end — show message
        setToast(t.checkin.alreadyCheckedIn);
      }
    } else {
      setShowPicker(true);
    }
  };

  // Listen for check-in requests from bus popups — removed (FAB-only check-in)

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

      {/* Active check-in badge — shows remaining time for both auth and anon */}
      {activeCheckIn && minutesLeft > 0 && (
        <div
          className="absolute right-[3.75rem] z-[1001] bg-green-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow whitespace-nowrap"
          style={{ bottom: "calc(var(--bottom-nav-height) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px) + 4.375rem)" }}
        >
          {t.checkin.minutesLeft(minutesLeft)}
        </div>
      )}

      {/* Mode picker popover */}
      {showPicker && createPortal(
        <div className="fixed inset-0 z-[2000]" onClick={() => { setShowPicker(false); setNearbyCandidates([]); setSelectedMode(null); }}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute right-4 bg-surface-raised rounded-2xl shadow-xl p-3 flex flex-col gap-2 min-w-[220px] animate-fade-in"
            style={{ bottom: "calc(var(--bottom-nav-height) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px) + 7rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {nearbyCandidates.length > 0 && selectedMode ? (
              <>
                <div className="flex items-center gap-2 px-1 mb-1">
                  <button
                    onClick={() => { setNearbyCandidates([]); setSelectedMode(null); }}
                    className="text-content-secondary hover:text-content text-sm"
                    aria-label={t.checkin.back}
                  >
                    ←
                  </button>
                  <p className="text-xs font-semibold text-content-secondary">{t.checkin.pickTarget}</p>
                </div>
                {nearbyCandidates.map((c, i) => (
                  <button
                    key={`${c.targetId}-${i}`}
                    onClick={() => {
                      // Don't send lat/lon for "cycling here" (privacy — user location)
                      const isUserLoc = c.targetId === "bike-here";
                      handleCheckIn(selectedMode, c.targetId, isUserLoc ? undefined : c.lat, isUserLoc ? undefined : c.lon);
                    }}
                    disabled={isLoading}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-sunken transition-colors text-left disabled:opacity-50"
                  >
                    <span className="text-xl">{c.emoji}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-content truncate">{c.label}</span>
                      <span className="text-xs text-content-secondary">{Math.round(c.distance)}m</span>
                    </div>
                  </button>
                ))}
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-content-secondary px-1 mb-1">{t.checkin.selectMode}</p>
                {MODE_OPTIONS.map(({ mode, emoji, key }) => (
                  <button
                    key={mode}
                    onClick={() => handleModeSelect(mode)}
                    disabled={isLoading}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-sunken transition-colors text-left disabled:opacity-50"
                  >
                    <span className="text-xl">{emoji}</span>
                    <span className="text-sm font-medium text-content">{t.checkin[key] as string}</span>
                  </button>
                ))}
              </>
            )}
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
