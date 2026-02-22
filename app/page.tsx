"use client";

import { useEffect, useState, useMemo, Suspense, useCallback } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import { useTranslations } from "@/lib/hooks/useTranslations";
import { logger } from "@/lib/logger";
import { MapSkeleton } from "@/components/LoadingSkeletons";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { LeafletMap } from "@/components/LeafletMap";
import { RouteFilterPanel } from "@/components/RouteFilterPanel";
import { MapLayerChips } from "@/components/MapLayerChips";
import { SettingsModal } from "@/components/SettingsModal";
import { BottomSheet } from "@/components/BottomSheet";
import { FeedbackForm } from "@/components/FeedbackForm";
import { GlobalSearch } from "@/components/GlobalSearch";
import { busesFetcher, stationsFetcher, routesFetcher, routeShapesFetcher, bikeParksFetcher, bikeLanesFetcher } from "@/lib/fetchers";
import { useFeedbackList } from "@/lib/hooks/useFeedback";
import { DesktopNav } from "@/components/DesktopNav";
import { CheckInFAB } from "@/components/CheckInFAB";
import { ActivityBubbles } from "@/components/ActivityBubbles";
import type { Map as LMap } from "leaflet";
import type { BusesResponse, StopsResponse, RoutePatternsResponse, RoutesResponse, RouteInfo, FeedbackItem, BikeParksResponse, BikeLanesResponse, ActiveCheckInsResponse } from "@/lib/types";

function MapPageContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showStops, setShowStops] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showStops");
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [showRoutes, setShowRoutes] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showRoutes");
      return saved ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRouteFilter, setShowRouteFilter] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showRouteFilter");
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [showBikeParks, setShowBikeParks] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showBikeParks");
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [showBikeLanes, setShowBikeLanes] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showBikeLanes");
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [selectedBikeLanes, setSelectedBikeLanes] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selectedBikeLanes");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [showLocationSuccess, setShowLocationSuccess] = useState(false);
  const [degradedDismissed, setDegradedDismissed] = useState(false);
  const [mapStyle, setMapStyle] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mapStyle") || "standard";
    }
    return "standard";
  });
  const [leafletMap, setLeafletMap] = useState<LMap | null>(null);
  const [showActivity, setShowActivity] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showActivity");
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [showAnimations, setShowAnimations] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showAnimations");
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [busNumberFilter, setBusNumberFilter] = useState("");

  // Feedback state for bottom sheet (triggered by bus popup custom event)
  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false);
  const [feedbackLineId, setFeedbackLineId] = useState("");
  const [feedbackLineName, setFeedbackLineName] = useState("");
  const { data: feedbackList } = useFeedbackList("LINE", showFeedbackSheet ? feedbackLineId : null);

  // Vehicle feedback state
  const [showVehicleFeedbackSheet, setShowVehicleFeedbackSheet] = useState(false);
  const [feedbackVehicleId, setFeedbackVehicleId] = useState("");
  const [feedbackVehicleName, setFeedbackVehicleName] = useState("");
  const [feedbackVehicleLineContext, setFeedbackVehicleLineContext] = useState("");
  const { data: vehicleFeedbackList } = useFeedbackList("VEHICLE", showVehicleFeedbackSheet ? feedbackVehicleId : null);

  // Bike park feedback state
  const [showBikeParkFeedbackSheet, setShowBikeParkFeedbackSheet] = useState(false);
  const [feedbackBikeParkId, setFeedbackBikeParkId] = useState("");
  const [feedbackBikeParkName, setFeedbackBikeParkName] = useState("");
  const { data: bikeParkFeedbackList } = useFeedbackList("BIKE_PARK", showBikeParkFeedbackSheet ? feedbackBikeParkId : null);

  // Bike lane feedback state
  const [showBikeLaneFeedbackSheet, setShowBikeLaneFeedbackSheet] = useState(false);
  const [feedbackBikeLaneId, setFeedbackBikeLaneId] = useState("");
  const [feedbackBikeLaneName, setFeedbackBikeLaneName] = useState("");
  const { data: bikeLaneFeedbackList } = useFeedbackList("BIKE_LANE", showBikeLaneFeedbackSheet ? feedbackBikeLaneId : null);

  // Listen for custom event from bus popup "Rate Line" button
  useEffect(() => {
    const handleLineFeedback = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.routeShortName) {
        setFeedbackLineId(detail.routeShortName);
        setFeedbackLineName(`${t.reviews.line} ${detail.routeShortName}`);
        setShowFeedbackSheet(true);
      }
    };
    window.addEventListener("open-line-feedback", handleLineFeedback);
    return () => window.removeEventListener("open-line-feedback", handleLineFeedback);
  }, [t]);

  // Listen for custom event from bus popup "Rate Vehicle" button
  useEffect(() => {
    const handleVehicleFeedback = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.vehicleNumber) {
        setFeedbackVehicleId(detail.vehicleNumber);
        setFeedbackVehicleName(`${t.reviews.vehicle} ${detail.vehicleNumber}`);
        setFeedbackVehicleLineContext(detail.lineContext || "");
        setShowVehicleFeedbackSheet(true);
      }
    };
    window.addEventListener("open-vehicle-feedback", handleVehicleFeedback);
    return () => window.removeEventListener("open-vehicle-feedback", handleVehicleFeedback);
  }, [t]);

  // Listen for custom event from bike park popup
  useEffect(() => {
    const handleBikeParkFeedback = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.parkId) {
        setFeedbackBikeParkId(detail.parkName || detail.parkId);
        setFeedbackBikeParkName(detail.parkName || `Parque ${detail.parkId}`);
        setShowBikeParkFeedbackSheet(true);
      }
    };
    window.addEventListener("open-bike-park-feedback", handleBikeParkFeedback);
    return () => window.removeEventListener("open-bike-park-feedback", handleBikeParkFeedback);
  }, []);

  // Listen for custom event from bike lane popup
  useEffect(() => {
    const handleBikeLaneFeedback = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.laneId) {
        setFeedbackBikeLaneId(detail.laneName || detail.laneId);
        setFeedbackBikeLaneName(detail.laneName || `Ciclovia ${detail.laneId}`);
        setShowBikeLaneFeedbackSheet(true);
      }
    };
    window.addEventListener("open-bike-lane-feedback", handleBikeLaneFeedback);
    return () => window.removeEventListener("open-bike-lane-feedback", handleBikeLaneFeedback);
  }, []);

  const handleFeedbackSuccess = useCallback((_feedback: FeedbackItem) => {
    // Feedback saved — BottomSheet stays open so user sees success message
  }, []);

  const highlightedStationId = searchParams?.get("station");

  const [selectedRoutes, setSelectedRoutes] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selectedRoutes");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [favoriteRoutes, setFavoriteRoutes] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("favoriteRoutes");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [favoritesAppliedOnLoad, setFavoritesAppliedOnLoad] = useState(false);

  const simulateParam = searchParams?.get("simulate");
  const busesUrl = simulateParam ? `/api/buses?simulate=${encodeURIComponent(simulateParam)}` : "/api/buses";

  const { data, error, isLoading, mutate } = useSWR<BusesResponse>(busesUrl, busesFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  const { data: stopsData, error: stopsError } = useSWR<StopsResponse>(
    "/api/stations",
    stationsFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 7 * 24 * 60 * 60 * 1000,
      revalidateIfStale: false,
    }
  );

  const { data: routePatternsData } = useSWR<RoutePatternsResponse>(
    selectedRoutes.length > 0 ? "/api/route-shapes" : null,
    routeShapesFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 24 * 60 * 60 * 1000,
    }
  );

  // Fetch all transit routes from OTP (source of truth)
  const { data: otpRoutesData } = useSWR<RoutesResponse>(
    "/api/routes",
    routesFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 24 * 60 * 60 * 1000,
      revalidateIfStale: false,
    }
  );

  // Fetch bike parks
  const { data: bikeParksData } = useSWR<BikeParksResponse>(
    "/api/bike-parks",
    bikeParksFetcher,
    {
      refreshInterval: 5 * 60 * 1000, // refresh every 5 minutes
      revalidateOnFocus: false,
    }
  );

  // Fetch bike lanes
  const { data: bikeLanesData } = useSWR<BikeLanesResponse>(
    "/api/bike-lanes",
    bikeLanesFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 7 * 24 * 60 * 60 * 1000, // cache for 7 days
      revalidateIfStale: false,
    }
  );

  // Fetch active check-ins for map indicators (badges on bus/bike/metro markers)
  const { data: activeCheckInsData, mutate: mutateActiveCheckIns } = useSWR<ActiveCheckInsResponse>(
    showActivity ? "/api/checkin/active" : null,
    (url: string) => fetch(url, { cache: "no-store" }).then(r => r.json()),
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  // Immediately revalidate when the current user checks in or out
  // Optimistically update the count for instant visual feedback
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const action = detail?.action || "add";

      if (detail?.mode) {
        mutateActiveCheckIns((prev) => {
          const base = prev || { checkIns: [], total: 0, todayTotal: 0 };
          const checkIns = [...base.checkIns];
          const key = `${detail.mode}:${detail.targetId || ""}`;
          const idx = checkIns.findIndex(ci => `${ci.mode}:${ci.targetId || ""}` === key);

          if (action === "add") {
            if (idx >= 0) {
              checkIns[idx] = { ...checkIns[idx], count: checkIns[idx].count + 1 };
            } else {
              checkIns.push({ mode: detail.mode, targetId: detail.targetId || "", lat: detail.lat ?? null, lon: detail.lon ?? null, count: 1 });
            }
            return { ...base, checkIns, total: base.total + 1, todayTotal: base.todayTotal + 1 };
          } else {
            if (idx >= 0) {
              if (checkIns[idx].count <= 1) {
                checkIns.splice(idx, 1);
              } else {
                checkIns[idx] = { ...checkIns[idx], count: checkIns[idx].count - 1 };
              }
            }
            return { ...base, checkIns, total: Math.max(0, base.total - 1) };
          }
        }, { revalidate: false }); // Don't revalidate — avoids race with the POST
      } else {
        mutateActiveCheckIns();
      }
    };

    // checkin-changed: optimistic (before POST), don't revalidate
    // checkin-confirmed: after POST succeeds, revalidate to get server truth
    const confirmHandler = () => { mutateActiveCheckIns(); };

    window.addEventListener("checkin-changed", handler);
    window.addEventListener("checkin-confirmed", confirmHandler);
    return () => {
      window.removeEventListener("checkin-changed", handler);
      window.removeEventListener("checkin-confirmed", confirmHandler);
    };
  }, [mutateActiveCheckIns]);

  // All routes from OTP (source of truth for the full list)
  const allRoutes: RouteInfo[] = otpRoutesData?.routes ?? [];

  // Compute which routes have live FIWARE vehicles right now
  const liveRoutes: Set<string> = new Set(
    data?.buses?.map((bus) => bus.routeShortName) ?? []
  );

  // Flat list of route shortNames for backward-compatible usage (search, favorites, feedback)
  const availableRouteNames: string[] = allRoutes.map((r) => r.shortName);

  const handleLocateMe = () => {
    setIsLocating(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError(t.map.geolocationNotSupported);
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setIsLocating(false);
        logger.log(`Location acquired: ${position.coords.latitude}, ${position.coords.longitude}`);
        setShowLocationSuccess(true);
        setTimeout(() => setShowLocationSuccess(false), 3000);
      },
      (err) => {
        setIsLocating(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setLocationError(t.map.locationPermissionDenied);
            break;
          case err.POSITION_UNAVAILABLE:
            setLocationError(t.map.unableToGetLocation);
            break;
          case err.TIMEOUT:
            setLocationError(t.map.locationRefreshFailed);
            break;
          default:
            setLocationError(t.map.unableToGetLocation);
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };

  const handleRefresh = async () => {
    const now = Date.now();
    if (now - lastRefreshTime < 5000) return;
    setIsRefreshing(true);
    setLastRefreshTime(now);
    await mutate();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    setIsMounted(true);
    const onboardingCompleted = localStorage.getItem('onboarding-completed');
    if (!onboardingCompleted) {
      setShowOnboarding(true);
    } else {
      setHasCompletedOnboarding(true);
    }
  }, []);

  // Persist state to localStorage
  useEffect(() => { localStorage.setItem("selectedRoutes", JSON.stringify(selectedRoutes)); }, [selectedRoutes]);
  useEffect(() => { localStorage.setItem("favoriteRoutes", JSON.stringify(favoriteRoutes)); }, [favoriteRoutes]);
  useEffect(() => { localStorage.setItem("showStops", JSON.stringify(showStops)); }, [showStops]);
  useEffect(() => { localStorage.setItem("showRoutes", JSON.stringify(showRoutes)); }, [showRoutes]);
  useEffect(() => { localStorage.setItem("mapStyle", mapStyle); }, [mapStyle]);
  useEffect(() => { localStorage.setItem("showRouteFilter", JSON.stringify(showRouteFilter)); }, [showRouteFilter]);
  useEffect(() => { localStorage.setItem("showBikeParks", JSON.stringify(showBikeParks)); }, [showBikeParks]);
  useEffect(() => { localStorage.setItem("showBikeLanes", JSON.stringify(showBikeLanes)); }, [showBikeLanes]);
  useEffect(() => { localStorage.setItem("selectedBikeLanes", JSON.stringify(selectedBikeLanes)); }, [selectedBikeLanes]);
  useEffect(() => { localStorage.setItem("showActivity", JSON.stringify(showActivity)); }, [showActivity]);
  useEffect(() => { localStorage.setItem("showAnimations", JSON.stringify(showAnimations)); }, [showAnimations]);

  const handleRateLine = useCallback((route: string) => {
    setFeedbackLineId(route);
    setFeedbackLineName(`${t.reviews.line} ${route}`);
    setShowFeedbackSheet(true);
  }, [t]);

  // Auto-filter to favorite routes on first data load
  useEffect(() => {
    if (!favoritesAppliedOnLoad && favoriteRoutes.length > 0 && availableRouteNames.length > 0 && selectedRoutes.length === 0) {
      const validFavorites = favoriteRoutes.filter(r => availableRouteNames.includes(r));
      if (validFavorites.length > 0) setSelectedRoutes(validFavorites);
      setFavoritesAppliedOnLoad(true);
    }
  }, [favoriteRoutes, availableRouteNames, favoritesAppliedOnLoad, selectedRoutes.length]);

  // Set of individual bus IDs (FIWARE entity IDs) with active check-ins
  // Used to override route filters — buses with activity are always shown on the map
  const activeBusIds = useMemo(() => {
    const ids = new Set<string>();
    if (showActivity && activeCheckInsData?.checkIns) {
      for (const ci of activeCheckInsData.checkIns) {
        if (ci.mode === "BUS" && ci.targetId) {
          ids.add(ci.targetId);
        }
      }
    }
    return ids;
  }, [activeCheckInsData, showActivity]);

  const filteredBuses = data?.buses
    ? (() => {
        let buses = data.buses;
        if (selectedRoutes.length > 0) {
          buses = buses.filter(bus => selectedRoutes.includes(bus.routeShortName) || activeBusIds.has(bus.id));
        }
        if (busNumberFilter.trim()) {
          const q = busNumberFilter.trim().toLowerCase();
          buses = buses.filter(bus => bus.vehicleNumber?.toLowerCase().includes(q));
        }
        return buses;
      })()
    : [];

  const toggleRoute = (route: string) => {
    setSelectedRoutes(prev =>
      prev.includes(route) ? prev.filter(r => r !== route) : [...prev, route]
    );
  };

  const toggleFavorite = (route: string) => {
    setFavoriteRoutes(prev =>
      prev.includes(route) ? prev.filter(r => r !== route) : [...prev, route]
    );
  };

  const toggleBikeLane = (laneId: string) => {
    setSelectedBikeLanes(prev =>
      prev.includes(laneId) ? prev.filter(id => id !== laneId) : [...prev, laneId]
    );
  };

  const clearBikeLaneFilters = () => {
    setSelectedBikeLanes([]);
  };

  const handleOnboardingComplete = (routes: string[], locationGranted: boolean) => {
    if (routes.length > 0) {
      setSelectedRoutes(routes);
      setFavoriteRoutes(routes);
    }
    if (locationGranted) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation([position.coords.latitude, position.coords.longitude]),
        (err) => logger.error("Geolocation error:", err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
    localStorage.setItem('onboarding-completed', 'true');
    setShowOnboarding(false);
    setHasCompletedOnboarding(true);
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem('onboarding-completed', 'skipped');
    setShowOnboarding(false);
    setHasCompletedOnboarding(true);
  };

  if (!isMounted) return <MapSkeleton />;

  if (showOnboarding && allRoutes.length > 0) {
    return <OnboardingFlow availableRoutes={allRoutes} onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-surface-sunken transition-colors">
      <header className="bg-surface dark:bg-surface-raised shadow-sm z-[1000] relative transition-colors">
        <div className="px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
           <div className="flex justify-between items-center gap-2">
            <div className="flex-shrink-0 min-w-0">
              <h1
                className="text-base sm:text-xl font-bold text-content cursor-pointer hover:text-accent transition-colors flex items-center gap-2"
                onClick={handleRefresh}
                title={t.map.refreshTitle}
              >
                <span className="hidden sm:inline">{t.map.busMap}</span>
                <span className="sm:hidden">{t.map.appName}</span>
                {isRefreshing && <span className="animate-spin text-base">🔄</span>}
              </h1>
            </div>
            <DesktopNav />
            <div className="hidden sm:block flex-1 max-w-xs">
              <GlobalSearch availableRoutes={allRoutes} />
            </div>
            <div className="hidden sm:block">
              <input
                type="text"
                value={busNumberFilter}
                onChange={(e) => setBusNumberFilter(e.target.value)}
                placeholder="Bus #"
                className="w-20 px-2 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-sunken)] text-[var(--color-content)] placeholder-[var(--color-content-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                aria-label="Filter by bus number"
              />
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-surface-sunken hover:bg-border text-content-secondary transition-colors"
              title={t.nav.settings}
              aria-label={t.nav.settings}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        {/* Floating Location Button */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          className={`absolute right-4 z-[1001] w-12 h-12 rounded-full shadow-lg border-2 flex items-center justify-center transition-all disabled:cursor-not-allowed ${
            isLocating
              ? "bg-blue-500 border-blue-600 animate-pulse"
              : userLocation
                ? "bg-blue-500 hover:bg-blue-600 border-blue-600 text-white"
                : "bg-surface-raised hover:bg-surface-sunken border-border"
          }`}
          style={{ bottom: 'calc(var(--bottom-nav-height) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px))' }}
          title={isLocating ? t.map.gettingLocation : userLocation ? t.map.updateLocation : t.map.getMyLocation}
        >
          {isLocating ? (
            <span className="text-xl text-white">⏳</span>
          ) : (
            <span className={`text-xl ${userLocation ? "text-white" : ""}`}>📍</span>
          )}
        </button>

        {/* Map layer chips — Google Maps style */}
        <div className="absolute top-3 left-3 right-3 z-[1000]">
          <MapLayerChips
            showStops={showStops}
            onToggleStops={() => setShowStops(!showStops)}
            stopsDisabled={!stopsData?.data?.stops}
            showRoutes={showRoutes}
            onToggleRoutes={() => setShowRoutes(!showRoutes)}
            routesDisabled={selectedRoutes.length === 0 || !routePatternsData?.patterns}
            showBikeParks={showBikeParks}
            onToggleBikeParks={() => setShowBikeParks(!showBikeParks)}
            bikeParksDisabled={!bikeParksData?.parks || bikeParksData.parks.length === 0}
            showBikeLanes={showBikeLanes}
            onToggleBikeLanes={() => setShowBikeLanes(!showBikeLanes)}
            bikeLanesDisabled={!bikeLanesData?.lanes || bikeLanesData.lanes.length === 0}
            selectedRoutesCount={selectedRoutes.length}
            onOpenRouteFilter={() => setShowRouteFilter(!showRouteFilter)}
          />
        </div>

        {/* Route filter panel (shown when filter chip is tapped) */}
        {showRouteFilter && (
          <div className="absolute top-14 left-3 right-3 z-[1000] max-w-md">
            <RouteFilterPanel
              allRoutes={allRoutes}
              liveRoutes={liveRoutes}
              selectedRoutes={selectedRoutes}
              favoriteRoutes={favoriteRoutes}
              showRouteFilter={showRouteFilter}
              onTogglePanel={() => setShowRouteFilter(!showRouteFilter)}
              onToggleRoute={toggleRoute}
              onClearFilters={() => setSelectedRoutes([])}
              onToggleFavorite={toggleFavorite}
            />
          </div>
        )}

        {/* Notification banners */}
        {error && (
          <div className="absolute top-14 left-1/2 transform -translate-x-1/2 z-[1000] bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-red-800 dark:text-red-200 text-sm">{t.map.errorLoadingBuses}</p>
          </div>
        )}

        {stopsError && (
          <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-[1000] bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">{t.map.stopsUnavailableError}</p>
          </div>
        )}

        {/* Degraded-state banner: shown when bus data loaded but is stale, or stops failed */}
        {!degradedDismissed && data && (error || stopsError) && (
          <div className="absolute bottom-[calc(var(--bottom-nav-height)+var(--bottom-nav-gap)+env(safe-area-inset-bottom,0px)+3.5rem)] left-1/2 transform -translate-x-1/2 z-[1000] bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 shadow-lg max-w-xs">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 dark:text-amber-400 text-xs flex-shrink-0">⚠</span>
              <p className="text-amber-800 dark:text-amber-200 text-xs flex-1">{t.map.dataOutdated}</p>
              <button
                onClick={() => setDegradedDismissed(true)}
                className="text-amber-600 dark:text-amber-400 text-xs font-medium hover:underline flex-shrink-0"
              >
                {t.map.dismiss}
              </button>
            </div>
          </div>
        )}

        {locationError && (
          <div className="absolute top-36 left-1/2 transform -translate-x-1/2 z-[1000] bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">{locationError}</p>
          </div>
        )}

        {showLocationSuccess && (
          <div className="absolute top-14 left-1/2 transform -translate-x-1/2 z-[1001] bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3 shadow-lg max-w-md animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-lg">✓</span>
              <p className="text-green-800 dark:text-green-200 text-sm font-medium">{t.map.locationSuccess}</p>
            </div>
          </div>
        )}

        {highlightedStationId && stopsData?.data?.stops && (
          <div className="absolute top-14 left-1/2 transform -translate-x-1/2 z-[1000] bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 shadow-lg max-w-md">
            <div className="flex items-center gap-2">
              <span className="text-lg">📍</span>
              <div>
                <p className="text-blue-900 dark:text-blue-200 text-sm font-semibold">
                  {stopsData.data.stops.find((s) => s.gtfsId === highlightedStationId)?.name || "Estação selecionada"}
                </p>
                <p className="text-blue-700 dark:text-blue-300 text-xs">Centrado no mapa</p>
              </div>
            </div>
          </div>
        )}

        {isLoading && !data && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] bg-surface-raised rounded-lg shadow-lg p-6">
            <p className="text-content-secondary">{t.map.loadingBusLocations}</p>
          </div>
        )}

        {data ? (
          <LeafletMap
            buses={filteredBuses}
            allBuses={data?.buses || []}
            stops={stopsData?.data?.stops || []}
            userLocation={userLocation}
            showStops={showStops && !!stopsData?.data?.stops}
            highlightedStationId={highlightedStationId || null}
            routePatterns={routePatternsData?.patterns || []}
            selectedRoutes={selectedRoutes}
            showRoutes={showRoutes}
            onSelectRoute={(route) => setSelectedRoutes(prev => prev.includes(route) ? prev : [...prev, route])}
            bikeParks={bikeParksData?.parks || []}
            bikeLanes={bikeLanesData?.lanes || []}
            showBikeParks={showBikeParks}
            showBikeLanes={showBikeLanes}
            selectedBikeLanes={selectedBikeLanes}
            mapStyle={mapStyle}
            onMapReady={setLeafletMap}
            activeCheckIns={activeCheckInsData?.checkIns}
            showActivity={showActivity}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <p className="text-content-secondary">Initializing map...</p>
          </div>
        )}

        {data && data.buses.length === 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] bg-surface-raised rounded-lg shadow-lg p-6">
            <p className="text-content-secondary">No buses currently tracked.</p>
          </div>
        )}

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onResetOnboarding={() => { localStorage.removeItem('onboarding-completed'); setShowSettings(false); setShowOnboarding(true); setHasCompletedOnboarding(false); }} mapStyle={mapStyle} onMapStyleChange={setMapStyle} showActivity={showActivity} onToggleActivity={setShowActivity} showAnimations={showAnimations} onToggleAnimations={setShowAnimations} />}

        {/* Line Feedback Bottom Sheet */}
        <BottomSheet
          isOpen={showFeedbackSheet}
          onClose={() => setShowFeedbackSheet(false)}
          title={t.feedback.lineFeedback}
        >
          <FeedbackForm
            type="LINE"
            targetId={feedbackLineId}
            targetName={feedbackLineName}
            existingFeedback={feedbackList?.userFeedback}
            onSuccess={handleFeedbackSuccess}
          />
          {feedbackList && feedbackList.feedbacks.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold text-content-secondary mb-3">
                {t.feedback.recentComments}
              </h3>
              <div className="space-y-3">
                {feedbackList.feedbacks
                  .filter((f) => f.comment)
                  .slice(0, 5)
                  .map((f) => (
                    <div key={f.id} className="bg-surface-sunken rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-400 text-xs">
                          {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                        </span>
                        <span className="text-xs text-content-muted">
                          {new Date(f.createdAt).toLocaleDateString("pt-PT")}
                        </span>
                      </div>
                      <p className="text-sm text-content-secondary">{f.comment}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </BottomSheet>

        {/* Vehicle Feedback Bottom Sheet */}
        <BottomSheet
          isOpen={showVehicleFeedbackSheet}
          onClose={() => setShowVehicleFeedbackSheet(false)}
          title={t.feedback.vehicleFeedback}
        >
          <FeedbackForm
            type="VEHICLE"
            targetId={feedbackVehicleId}
            targetName={feedbackVehicleName}
            existingFeedback={vehicleFeedbackList?.userFeedback}
            metadata={feedbackVehicleLineContext ? { lineContext: feedbackVehicleLineContext } : undefined}
            onSuccess={handleFeedbackSuccess}
          />
          {vehicleFeedbackList && vehicleFeedbackList.feedbacks.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold text-content-secondary mb-3">
                {t.feedback.recentComments}
              </h3>
              <div className="space-y-3">
                {vehicleFeedbackList.feedbacks
                  .filter((f) => f.comment)
                  .slice(0, 5)
                  .map((f) => (
                    <div key={f.id} className="bg-surface-sunken rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-400 text-xs">
                          {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                        </span>
                        {f.metadata?.lineContext && (
                          <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium">
                            Linha {f.metadata.lineContext}
                          </span>
                        )}
                        <span className="text-xs text-content-muted">
                          {new Date(f.createdAt).toLocaleDateString("pt-PT")}
                        </span>
                      </div>
                      <p className="text-sm text-content-secondary">{f.comment}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </BottomSheet>

        {/* Bike Park Feedback Bottom Sheet */}
        <BottomSheet
          isOpen={showBikeParkFeedbackSheet}
          onClose={() => setShowBikeParkFeedbackSheet(false)}
          title="Avaliar Parque de Bicicletas"
        >
          <FeedbackForm
            type="BIKE_PARK"
            targetId={feedbackBikeParkId}
            targetName={feedbackBikeParkName}
            existingFeedback={bikeParkFeedbackList?.userFeedback}
            onSuccess={handleFeedbackSuccess}
          />
          {bikeParkFeedbackList && bikeParkFeedbackList.feedbacks.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold text-content-secondary mb-3">
                {t.feedback.recentComments}
              </h3>
              <div className="space-y-3">
                {bikeParkFeedbackList.feedbacks
                  .filter((f) => f.comment)
                  .slice(0, 5)
                  .map((f) => (
                    <div key={f.id} className="bg-surface-sunken rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-400 text-xs">
                          {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                        </span>
                        <span className="text-xs text-content-muted">
                          {new Date(f.createdAt).toLocaleDateString("pt-PT")}
                        </span>
                      </div>
                      <p className="text-sm text-content-secondary">{f.comment}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </BottomSheet>

        {/* Bike Lane Feedback Bottom Sheet */}
        <BottomSheet
          isOpen={showBikeLaneFeedbackSheet}
          onClose={() => setShowBikeLaneFeedbackSheet(false)}
          title="Avaliar Ciclovia"
        >
          <FeedbackForm
            type="BIKE_LANE"
            targetId={feedbackBikeLaneId}
            targetName={feedbackBikeLaneName}
            existingFeedback={bikeLaneFeedbackList?.userFeedback}
            onSuccess={handleFeedbackSuccess}
          />
          {bikeLaneFeedbackList && bikeLaneFeedbackList.feedbacks.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold text-content-secondary mb-3">
                {t.feedback.recentComments}
              </h3>
              <div className="space-y-3">
                {bikeLaneFeedbackList.feedbacks
                  .filter((f) => f.comment)
                  .slice(0, 5)
                  .map((f) => (
                    <div key={f.id} className="bg-surface-sunken rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-400 text-xs">
                          {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                        </span>
                        <span className="text-xs text-content-muted">
                          {new Date(f.createdAt).toLocaleDateString("pt-PT")}
                        </span>
                      </div>
                      <p className="text-sm text-content-secondary">{f.comment}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </BottomSheet>

        {/* Check-in FAB (#49) */}
        <CheckInFAB
          userLocation={userLocation}
          buses={data?.buses}
          stops={stopsData?.data?.stops}
          bikeParks={bikeParksData?.parks}
          bikeLanes={bikeLanesData?.lanes}
          onLocationAcquired={setUserLocation}
        />

        {/* Activity Bubbles — map-embedded indicators for live check-ins */}
        <ActivityBubbles map={leafletMap} show={showActivity} bikeLanes={bikeLanesData?.lanes} animate={showAnimations} activeCheckIns={activeCheckInsData} userLocation={userLocation} />
      </main>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<MapSkeleton />}>
      <MapPageContent />
    </Suspense>
  );
}
