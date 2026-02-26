"use client";

import { useState, useEffect } from "react";

export function useMapSettings() {
  const [mapStyle, setMapStyle] = useState(() => {
    if (typeof window === "undefined") return "standard";
    return localStorage.getItem("mapStyle") || "standard";
  });

  const [showActivity, setShowActivity] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("showActivity");
    return saved !== null ? (JSON.parse(saved) as boolean) : true;
  });

  const [showAnimations, setShowAnimations] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("showAnimations");
    return saved !== null ? (JSON.parse(saved) as boolean) : true;
  });

  useEffect(() => {
    localStorage.setItem("mapStyle", mapStyle);
  }, [mapStyle]);
  useEffect(() => {
    localStorage.setItem("showActivity", JSON.stringify(showActivity));
  }, [showActivity]);
  useEffect(() => {
    localStorage.setItem("showAnimations", JSON.stringify(showAnimations));
  }, [showAnimations]);

  return {
    mapStyle,
    setMapStyle,
    showActivity,
    setShowActivity,
    showAnimations,
    setShowAnimations,
  };
}
