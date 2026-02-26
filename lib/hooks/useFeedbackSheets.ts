"use client";

import { useState, useEffect, useCallback } from "react";
import { useFeedbackList } from "@/lib/hooks/useFeedback";
import type { FeedbackItem } from "@/lib/types";

export function useFeedbackSheets(t: { reviews: { line: string; vehicle: string } }) {
  // Line feedback
  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);
  const [feedbackLineId, setFeedbackLineId] = useState("");
  const [feedbackLineName, setFeedbackLineName] = useState("");
  const { data: feedbackList } = useFeedbackList("LINE", showFeedbackSheet ? feedbackLineId : null);

  // Vehicle feedback
  const [showVehicleFeedbackSheet, setShowVehicleFeedbackSheet] = useState(false);
  const [feedbackVehicleId, setFeedbackVehicleId] = useState("");
  const [feedbackVehicleName, setFeedbackVehicleName] = useState("");
  const [feedbackVehicleLineContext, setFeedbackVehicleLineContext] = useState("");
  const { data: vehicleFeedbackList } = useFeedbackList(
    "VEHICLE",
    showVehicleFeedbackSheet ? feedbackVehicleId : null
  );

  // Bike park feedback
  const [showBikeParkFeedbackSheet, setShowBikeParkFeedbackSheet] = useState(false);
  const [feedbackBikeParkId, setFeedbackBikeParkId] = useState("");
  const [feedbackBikeParkName, setFeedbackBikeParkName] = useState("");
  const { data: bikeParkFeedbackList } = useFeedbackList(
    "BIKE_PARK",
    showBikeParkFeedbackSheet ? feedbackBikeParkId : null
  );

  // Bike lane feedback
  const [showBikeLaneFeedbackSheet, setShowBikeLaneFeedbackSheet] = useState(false);
  const [feedbackBikeLaneId, setFeedbackBikeLaneId] = useState("");
  const [feedbackBikeLaneName, setFeedbackBikeLaneName] = useState("");
  const { data: bikeLaneFeedbackList } = useFeedbackList(
    "BIKE_LANE",
    showBikeLaneFeedbackSheet ? feedbackBikeLaneId : null
  );

  // Listen for custom events from Leaflet popups
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.routeShortName) {
        setFeedbackLineId(detail.routeShortName);
        setFeedbackLineName(`${t.reviews.line} ${detail.routeShortName}`);
        setShowFeedbackSheet(true);
      }
    };
    window.addEventListener("open-line-feedback", handler);
    return () => window.removeEventListener("open-line-feedback", handler);
  }, [t.reviews.line]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.vehicleNumber) {
        setFeedbackVehicleId(detail.vehicleNumber);
        setFeedbackVehicleName(`${t.reviews.vehicle} ${detail.vehicleNumber}`);
        setFeedbackVehicleLineContext(detail.lineContext || "");
        setShowVehicleFeedbackSheet(true);
      }
    };
    window.addEventListener("open-vehicle-feedback", handler);
    return () => window.removeEventListener("open-vehicle-feedback", handler);
  }, [t.reviews.vehicle]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.parkId) {
        setFeedbackBikeParkId(detail.parkName || detail.parkId);
        setFeedbackBikeParkName(detail.parkName || `Parque ${detail.parkId}`);
        setShowBikeParkFeedbackSheet(true);
      }
    };
    window.addEventListener("open-bike-park-feedback", handler);
    return () => window.removeEventListener("open-bike-park-feedback", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.laneId) {
        setFeedbackBikeLaneId(detail.laneName || detail.laneId);
        setFeedbackBikeLaneName(detail.laneName || `Ciclovia ${detail.laneId}`);
        setShowBikeLaneFeedbackSheet(true);
      }
    };
    window.addEventListener("open-bike-lane-feedback", handler);
    return () => window.removeEventListener("open-bike-lane-feedback", handler);
  }, []);

  const handleFeedbackSuccess = useCallback((_feedback: FeedbackItem) => {
    // Feedback saved — sheet stays open so user sees success message
  }, []);

  return {
    // Line
    showFeedbackSheet,
    setShowFeedbackSheet,
    feedbackLineId,
    setFeedbackLineId,
    feedbackLineName,
    setFeedbackLineName,
    feedbackList,
    // Vehicle
    showVehicleFeedbackSheet,
    setShowVehicleFeedbackSheet,
    feedbackVehicleId,
    feedbackVehicleName,
    feedbackVehicleLineContext,
    vehicleFeedbackList,
    // Bike park
    showBikeParkFeedbackSheet,
    setShowBikeParkFeedbackSheet,
    feedbackBikeParkId,
    feedbackBikeParkName,
    bikeParkFeedbackList,
    // Bike lane
    showBikeLaneFeedbackSheet,
    setShowBikeLaneFeedbackSheet,
    feedbackBikeLaneId,
    feedbackBikeLaneName,
    bikeLaneFeedbackList,
    // Shared
    handleFeedbackSuccess,
  };
}
