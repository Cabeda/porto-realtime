"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
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
import { SettingsModal } from "@/components/SettingsModal";
import { BottomSheet } from "@/components/BottomSheet";
import { FeedbackForm } from "@/components/FeedbackForm";
import { GlobalSearch } from "@/components/GlobalSearch";
import { busesFetcher, stationsFetcher, fetcher } from "@/lib/fetchers";
import { useFeedbackList } from "@/lib/hooks/useFeedback";
import type { BusesResponse, StopsResponse, RoutePatternsResponse, RoutesResponse, RouteInfo, FeedbackItem } from "@/lib/types";

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
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [lastDataTime, setLastDataTime] = useState<number | null>(null);
  const [timeSinceUpdate, setTimeSinceUpdate] = useState("");
  const [isDataStale, setIsDataStale] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [showLocationSuccess, setShowLocationSuccess] = useState(false);

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
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 24 * 60 * 60 * 1000,
    }
  );

  // Fetch all transit routes from OTP (source of truth)
  const { data: otpRoutesData } = useSWR<RoutesResponse>(
    "/api/routes",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 24 * 60 * 60 * 1000,
      revalidateIfStale: false,
    }
  );

  // All routes from OTP (source of truth for the full list)
  const allRoutes: RouteInfo[] = otpRoutesData?.routes ?? [];

  // Compute which routes have live FIWARE vehicles right now
  const liveRoutes: Set<string> = new Set(
    data?.buses?.map((bus) => bus.routeShortName) ?? []
  );

  // Flat list of route shortNames for backward-compatible usage (search, favorites, feedback)
  const availableRouteNames: string[] = allRoutes.map((r) => r.shortName);

  // Track when bus data was last received
  useEffect(() => {
    if (data?.buses && data.buses.length > 0) {
      setLastDataTime(Date.now());
      setIsDataStale(!!data.stale);
    }
  }, [data]);

  // Update "time since last update" every second
  useEffect(() => {
    if (!lastDataTime) return;
    const updateLabel = () => {
      const seconds = Math.floor((Date.now() - lastDataTime) / 1000);
      if (seconds < 5) setTimeSinceUpdate("agora");
      else if (seconds < 60) setTimeSinceUpdate(`${seconds}s`);
      else setTimeSinceUpdate(`${Math.floor(seconds / 60)}m`);
    };
    updateLabel();
    const interval = setInterval(updateLabel, 1000);
    return () => clearInterval(interval);
  }, [lastDataTime]);

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
  useEffect(() => { localStorage.setItem("showRouteFilter", JSON.stringify(showRouteFilter)); }, [showRouteFilter]);

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

  const filteredBuses = data?.buses && selectedRoutes.length > 0
    ? data.buses.filter(bus => selectedRoutes.includes(bus.routeShortName))
    : data?.buses || [];

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
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm z-[1000] relative transition-colors">
        <div className="px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
           <div className="flex justify-between items-center gap-2">
            <div className="flex-shrink-0 min-w-0">
              <h1
                className="text-base sm:text-xl font-bold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-2"
                onClick={handleRefresh}
                title={t.map.refreshTitle}
              >
                <span className="hidden sm:inline">{t.map.busMap}</span>
                <span className="sm:hidden">{t.map.appName}</span>
                {isRefreshing && <span className="animate-spin text-base">🔄</span>}
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                {data ? (
                  <>
                    {t.map.busesCount(filteredBuses.length)}
                    {selectedRoutes.length > 0 && <span className="text-gray-500 dark:text-gray-500"> / {data.buses.length}</span>}
                    {timeSinceUpdate && <span className="text-gray-400 dark:text-gray-500">· {timeSinceUpdate}</span>}
                    {isDataStale && <span className="text-amber-600 dark:text-amber-400 font-medium">· {t.map.cachedData}</span>}
                  </>
                ) : t.map.loading}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1">
              <Link
                href="/stations"
                className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                🚏 {t.nav.stations}
              </Link>
              <Link
                href="/reviews"
                className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                ⭐ {t.nav.reviews}
              </Link>
            </div>
            <div className="hidden sm:block flex-1 max-w-xs">
              <GlobalSearch availableRoutes={allRoutes} />
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
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
          className={`absolute bottom-24 right-4 z-[1001] w-12 h-12 rounded-full shadow-lg border-2 flex items-center justify-center transition-all disabled:cursor-not-allowed sm:bottom-6 ${
            isLocating
              ? "bg-blue-500 border-blue-600 animate-pulse"
              : userLocation
                ? "bg-blue-500 hover:bg-blue-600 border-blue-600 text-white"
                : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700"
          }`}
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
          title={isLocating ? t.map.gettingLocation : userLocation ? t.map.updateLocation : t.map.getMyLocation}
        >
          {isLocating ? (
            <span className="text-xl text-white">⏳</span>
          ) : (
            <span className={`text-xl ${userLocation ? "text-white" : ""}`}>📍</span>
          )}
        </button>

        {/* Top-right controls */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 max-w-[calc(100vw-2rem)]">
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

          <div className="flex gap-2">
            <button
              onClick={() => setShowStops(!showStops)}
              disabled={!stopsData?.data?.stops}
              className={`flex-1 font-semibold py-2 px-3 rounded-lg shadow-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm ${
                showStops
                  ? "bg-red-500 hover:bg-red-600 text-white border-red-600 dark:border-red-500"
                  : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700"
              }`}
              title={!stopsData?.data?.stops ? t.map.stopsUnavailable : showStops ? t.map.hideStops : t.map.showStops}
            >
              🚏 {t.map.stops}
            </button>

            <button
              onClick={() => setShowRoutes(!showRoutes)}
              disabled={selectedRoutes.length === 0 || !routePatternsData?.patterns}
              className={`flex-1 font-semibold py-2 px-3 rounded-lg shadow-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm ${
                showRoutes
                  ? "bg-blue-500 hover:bg-blue-600 text-white border-blue-600 dark:border-blue-500"
                  : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700"
              }`}
              title={selectedRoutes.length === 0 ? t.map.selectLinesToSeePaths : showRoutes ? t.map.hidePaths : t.map.showPaths}
            >
              🛣️ {t.map.paths}
            </button>
          </div>
        </div>

        {/* Notification banners */}
        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-red-800 dark:text-red-200 text-sm">{t.map.errorLoadingBuses}</p>
          </div>
        )}

        {stopsError && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-[1000] bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">{t.map.stopsUnavailableError}</p>
          </div>
        )}

        {locationError && (
          <div className="absolute top-28 left-1/2 transform -translate-x-1/2 z-[1000] bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">{locationError}</p>
          </div>
        )}

        {showLocationSuccess && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1001] bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3 shadow-lg max-w-md animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-lg">✓</span>
              <p className="text-green-800 dark:text-green-200 text-sm font-medium">{t.map.locationSuccess}</p>
            </div>
          </div>
        )}

        {highlightedStationId && stopsData?.data?.stops && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 shadow-lg max-w-md">
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
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-gray-600 dark:text-gray-300">{t.map.loadingBusLocations}</p>
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
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <p className="text-gray-600 dark:text-gray-400">Initializing map...</p>
          </div>
        )}

        {data && data.buses.length === 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <p className="text-gray-600 dark:text-gray-300">No buses currently tracked.</p>
          </div>
        )}

        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onResetOnboarding={() => { localStorage.removeItem('onboarding-completed'); setShowSettings(false); setShowOnboarding(true); setHasCompletedOnboarding(false); }} />}

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
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {t.feedback.recentComments}
              </h3>
              <div className="space-y-3">
                {feedbackList.feedbacks
                  .filter((f) => f.comment)
                  .slice(0, 5)
                  .map((f) => (
                    <div key={f.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-400 text-xs">
                          {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(f.createdAt).toLocaleDateString("pt-PT")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{f.comment}</p>
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
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {t.feedback.recentComments}
              </h3>
              <div className="space-y-3">
                {vehicleFeedbackList.feedbacks
                  .filter((f) => f.comment)
                  .slice(0, 5)
                  .map((f) => (
                    <div key={f.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-400 text-xs">
                          {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                        </span>
                        {f.metadata?.lineContext && (
                          <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium">
                            Linha {f.metadata.lineContext}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(f.createdAt).toLocaleDateString("pt-PT")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{f.comment}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </BottomSheet>
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
