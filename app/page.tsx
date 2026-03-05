"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
import { FeedbackBottomSheet } from "@/components/FeedbackBottomSheet";
import { GlobalSearch } from "@/components/GlobalSearch";
import {
  busesFetcher,
  stationsFetcher,
  routesFetcher,
  routeShapesFetcher,
  bikeParksFetcher,
  bikeLanesFetcher,
} from "@/lib/fetchers";
import { DesktopNav } from "@/components/DesktopNav";
import { CheckInFAB } from "@/components/CheckInFAB";
import { ActivityBubbles } from "@/components/ActivityBubbles";
import { useMapLayers } from "@/lib/hooks/useMapLayers";
import { msUntilNextBurst } from "@/lib/bus-refresh";
import { useRouteFilter } from "@/lib/hooks/useRouteFilter";
import { useMapSettings } from "@/lib/hooks/useMapSettings";
import { useFeedbackSheets } from "@/lib/hooks/useFeedbackSheets";
import type { Map as LMap } from "leaflet";
import type {
  BusesResponse,
  StopsResponse,
  RoutePatternsResponse,
  RoutesResponse,
  RouteInfo,
  BikeParksResponse,
  BikeLanesResponse,
  ActiveCheckInsResponse,
} from "@/lib/types";

function MapPageContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [secondsSinceRefresh, setSecondsSinceRefresh] = useState<number | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [, setHasCompletedOnboarding] = useState(false);
  const [showLocationSuccess, setShowLocationSuccess] = useState(false);
  const [degradedDismissed, setDegradedDismissed] = useState(false);
  const [leafletMap, setLeafletMap] = useState<LMap | null>(null);

  // Custom hooks
  const {
    showStops,
    setShowStops,
    showRoutes,
    setShowRoutes,
    showBikeParks,
    setShowBikeParks,
    showBikeLanes,
    setShowBikeLanes,
    selectedBikeLanes,
  } = useMapLayers();
  const {
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
    clearFilters: _clearFilters,
  } = useRouteFilter();
  const {
    mapStyle,
    setMapStyle,
    showActivity,
    setShowActivity,
    showAnimations,
    setShowAnimations,
  } = useMapSettings();
  const {
    showFeedbackSheet,
    setShowFeedbackSheet,
    feedbackLineId,
    feedbackLineName,
    feedbackList,
    showVehicleFeedbackSheet,
    setShowVehicleFeedbackSheet,
    feedbackVehicleId,
    feedbackVehicleName,
    feedbackVehicleLineContext,
    vehicleFeedbackList,
    showBikeParkFeedbackSheet,
    setShowBikeParkFeedbackSheet,
    feedbackBikeParkId,
    feedbackBikeParkName,
    bikeParkFeedbackList,
    showBikeLaneFeedbackSheet,
    setShowBikeLaneFeedbackSheet,
    feedbackBikeLaneId,
    feedbackBikeLaneName,
    bikeLaneFeedbackList,
    handleFeedbackSuccess,
  } = useFeedbackSheets(t);

  const highlightedStationId = searchParams?.get("station");

  const simulateParam = searchParams?.get("simulate");
  const busesUrl = simulateParam
    ? `/api/buses?simulate=${encodeURIComponent(simulateParam)}`
    : "/api/buses";

  const { data, error, isLoading, mutate } = useSWR<BusesResponse>(busesUrl, busesFetcher, {
    // FIWARE refreshes in a burst at seconds :25–:28 of every minute.
    // Fire the next fetch at :24 so data arrives within ~1s of the upstream refresh.
    // This halves API calls (1 req/min) vs the previous 30s interval.
    refreshInterval: () => msUntilNextBurst(),
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
  const { data: otpRoutesData } = useSWR<RoutesResponse>("/api/routes", routesFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 24 * 60 * 60 * 1000,
    revalidateIfStale: false,
  });

  // Fetch bike parks
  const { data: bikeParksData } = useSWR<BikeParksResponse>("/api/bike-parks", bikeParksFetcher, {
    refreshInterval: 5 * 60 * 1000, // refresh every 5 minutes
    revalidateOnFocus: false,
  });

  // Fetch bike lanes
  const { data: bikeLanesData } = useSWR<BikeLanesResponse>("/api/bike-lanes", bikeLanesFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 7 * 24 * 60 * 60 * 1000, // cache for 7 days
    revalidateIfStale: false,
  });

  // Fetch active check-ins for map indicators (badges on bus/bike/metro markers)
  const { data: activeCheckInsData, mutate: mutateActiveCheckIns } = useSWR<ActiveCheckInsResponse>(
    showActivity ? "/api/checkin/active" : null,
    (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json()),
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  // Immediately revalidate when the current user checks in or out
  // Optimistically update the count for instant visual feedback
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const action = detail?.action || "add";

      if (detail?.mode) {
        mutateActiveCheckIns(
          (prev) => {
            const base = prev || { checkIns: [], total: 0, todayTotal: 0 };
            const checkIns = [...base.checkIns];
            const key = `${detail.mode}:${detail.targetId || ""}`;
            const idx = checkIns.findIndex((ci) => `${ci.mode}:${ci.targetId || ""}` === key);

            if (action === "add") {
              if (idx >= 0) {
                const existing = checkIns[idx]!;
                checkIns[idx] = { ...existing, count: existing.count + 1 };
              } else {
                checkIns.push({
                  mode: detail.mode,
                  targetId: detail.targetId || "",
                  lat: detail.lat ?? null,
                  lon: detail.lon ?? null,
                  count: 1,
                });
              }
              return { ...base, checkIns, total: base.total + 1, todayTotal: base.todayTotal + 1 };
            } else {
              if (idx >= 0) {
                const existing = checkIns[idx]!;
                if (existing.count <= 1) {
                  checkIns.splice(idx, 1);
                } else {
                  checkIns[idx] = { ...existing, count: existing.count - 1 };
                }
              }
              return { ...base, checkIns, total: Math.max(0, base.total - 1) };
            }
          },
          { revalidate: false }
        ); // Don't revalidate — avoids race with the POST
      } else {
        mutateActiveCheckIns();
      }
    };

    // checkin-changed: optimistic (before POST), don't revalidate
    // checkin-confirmed: after POST succeeds, revalidate to get server truth
    const confirmHandler = () => {
      mutateActiveCheckIns();
    };

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
  const liveRoutes: Set<string> = new Set(data?.buses?.map((bus) => bus.routeShortName) ?? []);

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
    if (isRefreshing) return; // already in flight
    setIsRefreshing(true);
    setLastRefreshTime(Date.now());
    setSecondsSinceRefresh(0);
    await mutate();
    setIsRefreshing(false);
  };

  // Tick "Xs ago" counter every second after a refresh
  useEffect(() => {
    if (lastRefreshTime === 0) return;
    const id = setInterval(() => {
      setSecondsSinceRefresh(Math.floor((Date.now() - lastRefreshTime) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [lastRefreshTime]);

  useEffect(() => {
    setIsMounted(true);
    const onboardingCompleted = localStorage.getItem("onboarding-completed");
    if (!onboardingCompleted) {
      setShowOnboarding(true);
    } else {
      setHasCompletedOnboarding(true);
    }
  }, []);

  // Persist state to localStorage — handled by custom hooks above

  // Auto-filter to favorite routes on first data load.
  // Only runs once (favoritesAppliedOnLoad guard). Does NOT require
  // selectedRoutes to be empty — favorites always win on first load.
  useEffect(() => {
    if (!favoritesAppliedOnLoad && favoriteRoutes.length > 0 && availableRouteNames.length > 0) {
      const validFavorites = favoriteRoutes.filter((r) => availableRouteNames.includes(r));
      if (validFavorites.length > 0) setSelectedRoutes(validFavorites);
      setFavoritesAppliedOnLoad(true);
    }
  }, [favoriteRoutes, availableRouteNames, favoritesAppliedOnLoad]);

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
          buses = buses.filter(
            (bus) => selectedRoutes.includes(bus.routeShortName) || activeBusIds.has(bus.id)
          );
        }
        return buses;
      })()
    : [];

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
    localStorage.setItem("onboarding-completed", "true");
    setShowOnboarding(false);
    setHasCompletedOnboarding(true);
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem("onboarding-completed", "skipped");
    setShowOnboarding(false);
    setHasCompletedOnboarding(true);
  };

  if (!isMounted) return <MapSkeleton />;

  if (showOnboarding && allRoutes.length > 0) {
    return (
      <OnboardingFlow
        availableRoutes={allRoutes}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-surface-sunken transition-colors">
      <header className="bg-surface dark:bg-surface-raised shadow-sm z-[1000] relative transition-colors">
        <div className="px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
          <div className="flex justify-between items-center gap-2">
            <div className="flex-shrink-0 min-w-0">
              <button
                className="flex items-center gap-2 text-base sm:text-xl font-bold text-content hover:text-accent transition-colors focus:outline-none"
                onClick={handleRefresh}
                title={t.map.refreshTitle}
                aria-label={t.map.refreshTitle}
              >
                <span className="hidden sm:inline">{t.map.busMap}</span>
                <span className="sm:hidden">{t.map.appName}</span>
                <svg
                  className={`w-4 h-4 flex-shrink-0 transition-colors ${isRefreshing ? "animate-spin text-accent" : "text-content-muted"}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {secondsSinceRefresh !== null && !isRefreshing && (
                  <span className="text-xs font-normal text-content-muted hidden sm:inline">
                    {secondsSinceRefresh < 60
                      ? `${secondsSinceRefresh}s ago`
                      : `${Math.floor(secondsSinceRefresh / 60)}m ago`}
                  </span>
                )}
              </button>
            </div>
            <DesktopNav />
            <div className="hidden sm:block flex-1 max-w-xs">
              <GlobalSearch availableRoutes={allRoutes} />
            </div>
            <div className="hidden sm:block">
              <button
                onClick={() => setShowSettings(true)}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-surface-sunken hover:bg-border text-content-secondary transition-colors"
                title={t.nav.settings}
                aria-label={t.nav.settings}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
        {/* Thin progress bar shown while fetching */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden transition-opacity duration-300 ${isRefreshing ? "opacity-100" : "opacity-0"}`}
        >
          <div
            className="h-full bg-accent animate-[progress_1s_ease-in-out_infinite]"
            style={{ width: "40%" }}
          />
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
          style={{
            bottom:
              "calc(var(--bottom-nav-height) + var(--bottom-nav-gap) + env(safe-area-inset-bottom, 0px))",
          }}
          title={
            isLocating
              ? t.map.gettingLocation
              : userLocation
                ? t.map.updateLocation
                : t.map.getMyLocation
          }
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
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              {t.map.stopsUnavailableError}
            </p>
          </div>
        )}

        {/* Degraded-state banner: shown when bus data loaded but is stale, or stops failed */}
        {!degradedDismissed && data && (error || stopsError) && (
          <div className="absolute bottom-[calc(var(--bottom-nav-height)+var(--bottom-nav-gap)+env(safe-area-inset-bottom,0px)+3.5rem)] left-1/2 transform -translate-x-1/2 z-[1000] bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 shadow-lg max-w-xs">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 dark:text-amber-400 text-xs flex-shrink-0">⚠</span>
              <p className="text-amber-800 dark:text-amber-200 text-xs flex-1">
                {t.map.dataOutdated}
              </p>
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
              <p className="text-green-800 dark:text-green-200 text-sm font-medium">
                {t.map.locationSuccess}
              </p>
            </div>
          </div>
        )}

        {highlightedStationId && stopsData?.data?.stops && (
          <div className="absolute top-14 left-1/2 transform -translate-x-1/2 z-[1000] bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 shadow-lg max-w-md">
            <div className="flex items-center gap-2">
              <span className="text-lg">📍</span>
              <div>
                <p className="text-blue-900 dark:text-blue-200 text-sm font-semibold">
                  {stopsData.data.stops.find((s) => s.gtfsId === highlightedStationId)?.name ||
                    t.map.selectedStation}
                </p>
                <p className="text-blue-700 dark:text-blue-300 text-xs">{t.map.centeredOnMap}</p>
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
            onSelectRoute={(route) =>
              setSelectedRoutes((prev) => (prev.includes(route) ? prev : [...prev, route]))
            }
            bikeParks={bikeParksData?.parks || []}
            bikeLanes={bikeLanesData?.lanes || []}
            showBikeParks={showBikeParks}
            showBikeLanes={showBikeLanes}
            selectedBikeLanes={selectedBikeLanes}
            mapStyle={mapStyle}
            onMapReady={setLeafletMap}
            activeCheckIns={activeCheckInsData?.checkIns}
            showActivity={showActivity}
            routes={allRoutes}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <p className="text-content-secondary">Initializing map...</p>
          </div>
        )}

        {data && data.buses.length === 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] bg-surface-raised rounded-lg shadow-lg p-6">
            <p className="text-content-secondary">{t.map.noBusesTracked}</p>
          </div>
        )}

        {showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            onResetOnboarding={() => {
              localStorage.removeItem("onboarding-completed");
              setShowSettings(false);
              setShowOnboarding(true);
              setHasCompletedOnboarding(false);
            }}
            mapStyle={mapStyle}
            onMapStyleChange={setMapStyle}
            showActivity={showActivity}
            onToggleActivity={setShowActivity}
            showAnimations={showAnimations}
            onToggleAnimations={setShowAnimations}
          />
        )}

        {/* Line Feedback Bottom Sheet */}
        <FeedbackBottomSheet
          isOpen={showFeedbackSheet}
          onClose={() => setShowFeedbackSheet(false)}
          title={t.feedback.lineFeedback}
          type="LINE"
          targetId={feedbackLineId}
          targetName={feedbackLineName}
          feedbackList={feedbackList}
          existingFeedback={feedbackList?.userFeedback}
          onSuccess={handleFeedbackSuccess}
        />

        {/* Vehicle Feedback Bottom Sheet */}
        <FeedbackBottomSheet
          isOpen={showVehicleFeedbackSheet}
          onClose={() => setShowVehicleFeedbackSheet(false)}
          title={t.feedback.vehicleFeedback}
          type="VEHICLE"
          targetId={feedbackVehicleId}
          targetName={feedbackVehicleName}
          feedbackList={vehicleFeedbackList}
          existingFeedback={vehicleFeedbackList?.userFeedback}
          metadata={
            feedbackVehicleLineContext ? { lineContext: feedbackVehicleLineContext } : undefined
          }
          onSuccess={handleFeedbackSuccess}
        />

        {/* Bike Park Feedback Bottom Sheet */}
        <FeedbackBottomSheet
          isOpen={showBikeParkFeedbackSheet}
          onClose={() => setShowBikeParkFeedbackSheet(false)}
          title={t.feedback.bikeParkFeedback}
          type="BIKE_PARK"
          targetId={feedbackBikeParkId}
          targetName={feedbackBikeParkName}
          feedbackList={bikeParkFeedbackList}
          existingFeedback={bikeParkFeedbackList?.userFeedback}
          onSuccess={handleFeedbackSuccess}
        />

        {/* Bike Lane Feedback Bottom Sheet */}
        <FeedbackBottomSheet
          isOpen={showBikeLaneFeedbackSheet}
          onClose={() => setShowBikeLaneFeedbackSheet(false)}
          title={t.feedback.bikeLaneFeedback}
          type="BIKE_LANE"
          targetId={feedbackBikeLaneId}
          targetName={feedbackBikeLaneName}
          feedbackList={bikeLaneFeedbackList}
          existingFeedback={bikeLaneFeedbackList?.userFeedback}
          onSuccess={handleFeedbackSuccess}
        />

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
        <ActivityBubbles
          map={leafletMap}
          show={showActivity}
          bikeLanes={bikeLanesData?.lanes}
          animate={showAnimations}
          activeCheckIns={activeCheckInsData}
          userLocation={userLocation}
        />
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
