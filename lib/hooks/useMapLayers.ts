"use client";

import { useState, useEffect } from "react";

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const saved = localStorage.getItem(key);
  return saved !== null ? (JSON.parse(saved) as boolean) : fallback;
}

export function useMapLayers() {
  const [showStops, setShowStops] = useState(() => readBool("showStops", false));
  const [showRoutes, setShowRoutes] = useState(() => readBool("showRoutes", true));
  const [showBikeParks, setShowBikeParks] = useState(() => readBool("showBikeParks", false));
  const [showBikeLanes, setShowBikeLanes] = useState(() => readBool("showBikeLanes", false));
  const [selectedBikeLanes, setSelectedBikeLanes] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("selectedBikeLanes");
    return saved ? (JSON.parse(saved) as string[]) : [];
  });

  useEffect(() => {
    localStorage.setItem("showStops", JSON.stringify(showStops));
  }, [showStops]);
  useEffect(() => {
    localStorage.setItem("showRoutes", JSON.stringify(showRoutes));
  }, [showRoutes]);
  useEffect(() => {
    localStorage.setItem("showBikeParks", JSON.stringify(showBikeParks));
  }, [showBikeParks]);
  useEffect(() => {
    localStorage.setItem("showBikeLanes", JSON.stringify(showBikeLanes));
  }, [showBikeLanes]);
  useEffect(() => {
    localStorage.setItem("selectedBikeLanes", JSON.stringify(selectedBikeLanes));
  }, [selectedBikeLanes]);

  const toggleBikeLane = (laneId: string) =>
    setSelectedBikeLanes((prev) =>
      prev.includes(laneId) ? prev.filter((id) => id !== laneId) : [...prev, laneId]
    );

  const clearBikeLaneFilters = () => setSelectedBikeLanes([]);

  return {
    showStops,
    setShowStops,
    showRoutes,
    setShowRoutes,
    showBikeParks,
    setShowBikeParks,
    showBikeLanes,
    setShowBikeLanes,
    selectedBikeLanes,
    toggleBikeLane,
    clearBikeLaneFilters,
  };
}
