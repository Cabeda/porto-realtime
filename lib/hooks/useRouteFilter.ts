"use client";

import { useState, useEffect } from "react";

export function useRouteFilter() {
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("selectedRoutes");
    return saved ? (JSON.parse(saved) as string[]) : [];
  });

  const [favoriteRoutes, setFavoriteRoutes] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("favoriteRoutes");
    return saved ? (JSON.parse(saved) as string[]) : [];
  });

  const [showRouteFilter, setShowRouteFilter] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("showRouteFilter");
    return saved ? (JSON.parse(saved) as boolean) : false;
  });

  const [favoritesAppliedOnLoad, setFavoritesAppliedOnLoad] = useState(false);

  useEffect(() => {
    localStorage.setItem("selectedRoutes", JSON.stringify(selectedRoutes));
  }, [selectedRoutes]);
  useEffect(() => {
    localStorage.setItem("favoriteRoutes", JSON.stringify(favoriteRoutes));
  }, [favoriteRoutes]);
  useEffect(() => {
    localStorage.setItem("showRouteFilter", JSON.stringify(showRouteFilter));
  }, [showRouteFilter]);

  const toggleRoute = (route: string) =>
    setSelectedRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );

  const toggleFavorite = (route: string) =>
    setFavoriteRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );

  const clearFilters = () => setSelectedRoutes([]);

  return {
    selectedRoutes,
    setSelectedRoutes,
    favoriteRoutes,
    setFavoriteRoutes,
    showRouteFilter,
    setShowRouteFilter,
    favoritesAppliedOnLoad,
    setFavoritesAppliedOnLoad,
    toggleRoute,
    toggleFavorite,
    clearFilters,
  };
}
