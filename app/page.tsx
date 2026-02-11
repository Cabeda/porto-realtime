"use client";

import { useEffect, useState, Suspense } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import "leaflet/dist/leaflet.css";
import { translations } from "@/lib/translations";
import { logger } from "@/lib/logger";
import { MapSkeleton } from "@/components/LoadingSkeletons";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { LeafletMap } from "@/components/LeafletMap";
import { RouteFilterPanel } from "@/components/RouteFilterPanel";
import { AboutModal } from "@/components/AboutModal";
import { busesFetcher, stationsFetcher, fetcher } from "@/lib/fetchers";
import type { BusesResponse, StopsResponse, RoutePatternsResponse } from "@/lib/types";

function MapPageContent() {
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
  const [showAboutModal, setShowAboutModal] = useState(false);
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

  const highlightedStationId = searchParams?.get("station");
  const [showStationToast, setShowStationToast] = useState(true);
  useEffect(() => {
    if (highlightedStationId) {
      setShowStationToast(true);
      const t = setTimeout(() => setShowStationToast(false), 4000);
      return () => clearTimeout(t);
    }
  }, [highlightedStationId]);
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

  const { data, error, isLoading, mutate } = useSWR<BusesResponse>("/api/buses", busesFetcher, {
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
      setLocationError("Localização não suportada neste navegador");
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
            setLocationError("Permissão de localização negada. Verifique as definições do navegador.");
            break;
          case err.POSITION_UNAVAILABLE:
            setLocationError("Localização indisponível. Verifique o GPS/Wi-Fi.");
            break;
          case err.TIMEOUT:
            setLocationError("Tempo esgotado ao obter localização. Tente novamente.");
            break;
          default:
            setLocationError(translations.map.unableToGetLocation);
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

  // Get unique routes from bus data
  const availableRoutes = data?.buses
    ? Array.from(new Set(data.buses.map(bus => bus.routeShortName)))
        .sort((a, b) => {
          const aNum = parseInt(a);
          const bNum = parseInt(b);
          if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
          return a.localeCompare(b);
        })
    : [];

  // Auto-filter to favorite routes on first data load
  useEffect(() => {
    if (!favoritesAppliedOnLoad && favoriteRoutes.length > 0 && availableRoutes.length > 0 && selectedRoutes.length === 0) {
      const validFavorites = favoriteRoutes.filter(r => availableRoutes.includes(r));
      if (validFavorites.length > 0) setSelectedRoutes(validFavorites);
      setFavoritesAppliedOnLoad(true);
    }
  }, [favoriteRoutes, availableRoutes, favoritesAppliedOnLoad, selectedRoutes.length]);

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

  if (showOnboarding && availableRoutes.length > 0) {
    return <OnboardingFlow availableRoutes={availableRoutes} onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />;
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors">
      <header className="bg-white dark:bg-gray-800 shadow-sm z-[1000] relative transition-colors">
        <div className="px-3 sm:px-6 lg:px-8 py-2 sm:py-3">
          <div className="flex justify-between items-center">
            <div className="flex-1 min-w-0">
              <h1
                className="text-base sm:text-xl font-bold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-2"
                onClick={handleRefresh}
                title={translations.map.refreshTitle}
              >
                <span className="hidden sm:inline">Mapa de Autocarros</span>
                <span className="sm:hidden">Porto Buses</span>
                {isRefreshing && <span className="animate-spin text-base">🔄</span>}
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                {data ? (
                  <>
                    {filteredBuses.length} {filteredBuses.length === 1 ? 'autocarro' : 'autocarros'}
                    {selectedRoutes.length > 0 && <span className="text-gray-500 dark:text-gray-500"> / {data.buses.length}</span>}
                    {timeSinceUpdate && <span className="text-gray-400 dark:text-gray-500">· {timeSinceUpdate}</span>}
                    {isDataStale && <span className="text-amber-600 dark:text-amber-400 font-medium">· dados em cache</span>}
                  </>
                ) : translations.map.loading}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setShowAboutModal(true)}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 text-lg sm:text-base transition-colors"
                title="Sobre este projeto"
              >
                <span className="sm:hidden">ℹ️</span>
                <span className="hidden sm:inline">ℹ️ Sobre</span>
              </button>
              <DarkModeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        {/* Floating Location Button */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          className={`absolute bottom-20 right-4 z-[1001] w-12 h-12 rounded-full shadow-lg border-2 flex items-center justify-center transition-all disabled:cursor-not-allowed sm:bottom-6 ${
            isLocating
              ? "bg-blue-500 border-blue-600 animate-pulse"
              : userLocation
                ? "bg-blue-500 hover:bg-blue-600 border-blue-600 text-white"
                : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700"
          }`}
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
          title={isLocating ? "A obter localização..." : userLocation ? "Atualizar localização" : "Obter a minha localização"}
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
            availableRoutes={availableRoutes}
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
              title={!stopsData?.data?.stops ? translations.map.stopsUnavailable : showStops ? translations.map.hideStops : translations.map.showStops}
            >
              🚏 {showStops ? 'Ocultar' : 'Paragens'}
            </button>

            <button
              onClick={() => setShowRoutes(!showRoutes)}
              disabled={selectedRoutes.length === 0 || !routePatternsData?.patterns}
              className={`flex-1 font-semibold py-2 px-3 rounded-lg shadow-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm ${
                showRoutes
                  ? "bg-blue-500 hover:bg-blue-600 text-white border-blue-600 dark:border-blue-500"
                  : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700"
              }`}
              title={selectedRoutes.length === 0 ? "Selecione linhas para ver caminhos" : showRoutes ? "Ocultar Caminhos" : "Mostrar Caminhos"}
            >
              🛣️ {showRoutes ? 'Ocultar' : 'Caminhos'}
            </button>
          </div>
        </div>

        {/* Notification banners */}
        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-red-800 dark:text-red-200 text-sm">{translations.map.errorLoadingBuses}</p>
          </div>
        )}

        {stopsError && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-[1000] bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">{translations.map.stopsUnavailableError}</p>
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
              <p className="text-green-800 dark:text-green-200 text-sm font-medium">Localização obtida com sucesso</p>
            </div>
          </div>
        )}

        {showStationToast && highlightedStationId && stopsData?.data?.stops && (
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
            <p className="text-gray-600 dark:text-gray-300">{translations.map.loadingBusLocations}</p>
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

        {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} onResetOnboarding={() => { localStorage.removeItem('onboarding-completed'); setShowAboutModal(false); setShowOnboarding(true); setHasCompletedOnboarding(false); }} />}
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
