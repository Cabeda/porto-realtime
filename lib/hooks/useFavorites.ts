"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEYS = {
  stops: "favoriteStations",
  lines: "favoriteRoutes",
} as const;

type FavoriteType = keyof typeof STORAGE_KEYS;

function readFromStorage(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function useFavorites(type: FavoriteType) {
  const key = STORAGE_KEYS[type];
  const [ids, setIds] = useState<string[]>(() => readFromStorage(key));

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(ids));
  }, [key, ids]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const isFavorite = useCallback((id: string) => ids.includes(id), [ids]);

  const setAll = useCallback((newIds: string[]) => {
    setIds(newIds);
  }, []);

  return { ids, toggle, isFavorite, setAll };
}
