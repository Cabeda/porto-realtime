"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { stationsFetcher } from "@/lib/fetchers";
import { useTranslations } from "@/lib/hooks/useTranslations";
import type { StopsResponse, RouteInfo } from "@/lib/types";

interface SearchResult {
  type: "line" | "stop";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

const RECENT_KEY = "portomove-recent-searches";
const MAX_RECENT = 5;

function getRecentSearches(): SearchResult[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(result: SearchResult) {
  const recent = getRecentSearches().filter((r) => r.id !== result.id);
  recent.unshift(result);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function GlobalSearch({ availableRoutes }: { availableRoutes?: RouteInfo[] | string[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch stops for search (uses SWR cache — same key as stations page)
  const { data: stopsData } = useSWR<StopsResponse>("/api/stations", stationsFetcher, {
    dedupingInterval: 7 * 24 * 60 * 60 * 1000,
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const stops = stopsData?.data?.stops ?? [];
  // Normalize routes: accept both RouteInfo[] and string[]
  const routes: RouteInfo[] = (availableRoutes ?? []).map((r) =>
    typeof r === "string" ? { shortName: r, longName: "", mode: "BUS" as const, gtfsId: "" } : r
  );

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const results: SearchResult[] = (() => {
    if (query.length < 1) return [];
    const q = query.toLowerCase();
    const items: SearchResult[] = [];

    // Search lines (match shortName or longName)
    const matchingRoutes = routes.filter(
      (r) => r.shortName.toLowerCase().includes(q) || r.longName.toLowerCase().includes(q)
    );
    for (const r of matchingRoutes.slice(0, 5)) {
      items.push({
        type: "line",
        id: `line-${r.shortName}`,
        label: `${t.reviews.line} ${r.shortName}`,
        sublabel: r.longName || undefined,
        href: `/reviews/line?id=${encodeURIComponent(r.shortName)}`,
      });
    }

    // Search stops
    const matchingStops = stops.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q) || s.gtfsId.toLowerCase().includes(q)
    );
    for (const s of matchingStops.slice(0, 8)) {
      items.push({
        type: "stop",
        id: `stop-${s.gtfsId}`,
        label: s.name,
        sublabel: s.code || undefined,
        href: `/station?gtfsId=${encodeURIComponent(s.gtfsId)}`,
      });
    }

    return items;
  })();

  const navigate = useCallback(
    (result: SearchResult) => {
      saveRecentSearch(result);
      setRecentSearches(getRecentSearches());
      setQuery("");
      setIsOpen(false);
      router.push(result.href);
    },
    [router]
  );

  const showDropdown = isOpen && (query.length >= 1 || recentSearches.length > 0);
  const displayItems = query.length >= 1 ? results : recentSearches;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={t.search.placeholder}
          className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {query.length < 1 && recentSearches.length > 0 && (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 font-medium">
              {t.search.recentSearches}
            </div>
          )}

          {displayItems.length > 0 ? (
            displayItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item)}
                className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <span className="text-base flex-shrink-0">
                  {item.type === "line" ? "🚌" : "🚏"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {item.label}
                  </div>
                  {item.sublabel && (
                    <div className="text-xs text-gray-400 dark:text-gray-500">{item.sublabel}</div>
                  )}
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {item.type === "line" ? t.search.lines : t.search.stops}
                </span>
              </button>
            ))
          ) : query.length >= 1 ? (
            <div className="px-3 py-4 text-center text-sm text-gray-400 dark:text-gray-500">
              {t.search.noResults}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
