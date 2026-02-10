"use client";

import { useEffect, useState, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import { translations } from "@/lib/translations";
import { logger } from "@/lib/logger";
import { MapSkeleton } from "@/components/LoadingSkeletons";

interface Bus {
  id: string;
  lat: number;
  lon: number;
  routeShortName: string;
  routeLongName: string;
  heading: number;
  speed: number;
  lastUpdated: string;
  vehicleNumber: string;
}

interface BusesResponse {
  buses: Bus[];
}

interface Stop {
  code: string;
  desc: string;
  lat: number;
  lon: number;
  name: string;
  gtfsId: string;
}

interface StopsResponse {
  data: {
    stops: Stop[];
  };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Wrapper component that prevents re-initialization
function LeafletMap({
  buses,
  stops,
  userLocation,
  showStops,
}: {
  buses: Bus[];
  stops: Stop[];
  userLocation: [number, number] | null;
  showStops: boolean;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const stopMarkersRef = useRef<any[]>([]);
  const locationMarkerRef = useRef<any>(null);

  useEffect(() => {
    // Only initialize once
    if (mapInstanceRef.current) {
      return;
    }

    // Dynamically import Leaflet
    import("leaflet").then((L) => {
      if (!mapContainerRef.current || mapInstanceRef.current) {
        return;
      }

      // Create map
      const center = userLocation || [41.1579, -8.6291];
      const zoom = userLocation ? 15 : 13;

      const map = L.map(mapContainerRef.current).setView(center as any, zoom);
      mapInstanceRef.current = map;

      // Add tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
    });

    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Empty deps - only run once

  // Update markers when buses change
  useEffect(() => {
    if (!mapInstanceRef.current) {
      logger.log("Map not initialized yet");
      return;
    }
    
    if (buses.length === 0) {
      logger.log("No buses data");
      return;
    }

    logger.log(`Adding ${buses.length} bus markers to map`);

    import("leaflet").then((L) => {
      // Clear existing bus markers only (keep location marker)
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      // Add bus markers with line numbers and destinations
      buses.forEach((bus) => {
        logger.log(`Adding marker for bus ${bus.routeShortName} at [${bus.lat}, ${bus.lon}]`);
        
        const destinationText = bus.routeLongName || 'Destino desconhecido';
        
        // Truncate destination for display (keep it short for mobile)
        const truncatedDestination = destinationText.length > 20 
          ? destinationText.substring(0, 17) + '...' 
          : destinationText;
        
        // Create custom icon with line number AND destination
        const busIcon = L.divIcon({
          html: `
            <div style="
              display: flex;
              align-items: center;
              gap: 4px;
              filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
            ">
              <!-- Line number badge -->
              <div style="
                min-width: 44px;
                height: 32px;
                background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
                border: 2px solid white;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 14px;
                color: white;
                font-family: system-ui, -apple-system, sans-serif;
                cursor: pointer;
                padding: 0 6px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
              ">
                ${bus.routeShortName}
              </div>
              
              <!-- Destination label -->
              <div style="
                background: rgba(255, 255, 255, 0.98);
                border: 1px solid #cbd5e1;
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 11px;
                font-weight: 600;
                color: #1e40af;
                font-family: system-ui, -apple-system, sans-serif;
                white-space: nowrap;
                cursor: pointer;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                max-width: 150px;
                overflow: hidden;
                text-overflow: ellipsis;
              ">
                ${truncatedDestination}
              </div>
            </div>
          `,
          className: "custom-bus-marker-with-destination",
          iconSize: [210, 32],
          iconAnchor: [24, 16],
          popupAnchor: [80, -16],
        });

        const marker = L.marker([bus.lat, bus.lon], { 
          icon: busIcon,
          title: `Linha ${bus.routeShortName} → ${destinationText}` // Full tooltip on hover
        })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="bus-popup text-sm" style="min-width: 240px; font-family: system-ui, -apple-system, sans-serif;">
              <div style="font-size: 18px; font-weight: bold; color: #2563eb; margin-bottom: 4px;">
                Linha ${bus.routeShortName}
              </div>
              <div style="font-size: 15px; font-weight: 600; color: #1e40af; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb;">
                → ${destinationText}
              </div>
              <div style="margin-bottom: 4px; color: #374151;"><strong>Velocidade:</strong> ${bus.speed > 0 ? Math.round(bus.speed) + ' km/h' : '🛑 Parado'}</div>
              ${bus.vehicleNumber ? `<div style="margin-bottom: 4px; color: #374151;"><strong>Veículo nº</strong> ${bus.vehicleNumber}</div>` : ''}
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280;">
                Atualizado: ${new Date(bus.lastUpdated).toLocaleTimeString('pt-PT')}
              </div>
            </div>
          `);
        markersRef.current.push(marker);
      });
      
      logger.log(`Successfully added ${markersRef.current.length} markers`);
    });
  }, [buses]);

  // Update stop markers when stops or showStops change
  useEffect(() => {
    if (!mapInstanceRef.current) {
      return;
    }

    import("leaflet").then((L) => {
      // Clear existing stop markers
      stopMarkersRef.current.forEach((marker) => marker.remove());
      stopMarkersRef.current = [];

      if (!showStops || stops.length === 0) {
        return;
      }

      logger.log(`Adding ${stops.length} stop markers to map`);

      // Add stop markers
      stops.forEach((stop) => {
        // Create simple circular icon for stops
        const stopIcon = L.divIcon({
          html: `
            <div style="
              width: 10px;
              height: 10px;
              background: #ef4444;
              border: 2px solid white;
              border-radius: 50%;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
              cursor: pointer;
            "></div>
          `,
          className: "custom-stop-marker",
          iconSize: [10, 10],
          iconAnchor: [5, 5],
          popupAnchor: [0, -5],
        });

        const marker = L.marker([stop.lat, stop.lon], { icon: stopIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="stop-popup text-sm" style="min-width: 200px; font-family: system-ui, -apple-system, sans-serif;">
              <div style="font-size: 14px; font-weight: bold; color: #ef4444; margin-bottom: 6px;">
                ${stop.name}
              </div>
              ${stop.code ? `<div style="margin-bottom: 4px; font-size: 12px;"><strong>Código:</strong> ${stop.code}</div>` : ''}
              ${stop.desc ? `<div style="margin-bottom: 6px; font-size: 12px; color: #6b7280;">${stop.desc}</div>` : ''}
              <a href="/station?gtfsId=${stop.gtfsId}" 
                 style="display: inline-block; margin-top: 8px; padding: 6px 12px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; font-weight: 500;"
                 target="_blank">
                Ver Horários →
              </a>
            </div>
          `);
        stopMarkersRef.current.push(marker);
      });

      logger.log(`Successfully added ${stopMarkersRef.current.length} stop markers`);
    });
  }, [stops, showStops]);

  // Fly to location when it changes
  useEffect(() => {
    if (!userLocation || !mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      // Remove old location marker if exists
      if (locationMarkerRef.current) {
        locationMarkerRef.current.remove();
      }

      // Add new location marker
      const locationIcon = L.divIcon({
        html: `<div style="font-size: 32px; text-align: center; line-height: 1;">📍</div>`,
        className: "custom-location-icon",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      locationMarkerRef.current = L.marker(userLocation, { icon: locationIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup('<div class="text-sm"><div class="font-bold text-blue-600">Your Location</div></div>');

      // Fly to location
      mapInstanceRef.current.flyTo(userLocation, 15, { duration: 1.5 });
    });
  }, [userLocation]);

  return <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />;
}

export default function MapPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Load selected routes from localStorage on mount
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selectedRoutes");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const { data, error, isLoading, mutate } = useSWR<BusesResponse>("/api/buses", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  // Only fetch stations when user wants to show stops (deferred loading for performance)
  const { data: stopsData, error: stopsError } = useSWR<StopsResponse>(
    showStops ? "/api/stations" : null,  // Conditional fetching
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 30 * 24 * 60 * 60 * 1000, // 30 days - don't refetch within this period
      revalidateIfStale: false, // Don't revalidate even if stale
    }
  );

  const handleLocateMe = () => {
    setIsLocating(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError(translations.map.geolocationNotSupported);
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        setIsLocating(false);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          logger.log(translations.map.locationPermissionDenied);
        } else {
          setLocationError(translations.map.unableToGetLocation);
        }
        setIsLocating(false);
        logger.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    // Refresh bus data
    await mutate();
    
    // Refresh user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation([latitude, longitude]);
        },
        (error) => {
          logger.log(translations.map.locationRefreshFailed);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    }
    
    // Keep refresh indicator for at least 500ms so user sees the feedback
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

  useEffect(() => {
    setIsMounted(true);

    // Automatically request user location on page load
    handleLocateMe();
  }, []);

  // Persist selected routes to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedRoutes", JSON.stringify(selectedRoutes));
    }
  }, [selectedRoutes]);

  // Get unique routes from bus data
  const availableRoutes = data?.buses 
    ? Array.from(new Set(data.buses.map(bus => bus.routeShortName)))
        .sort((a, b) => {
          // Sort numerically if both are numbers, otherwise alphabetically
          const aNum = parseInt(a);
          const bNum = parseInt(b);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return aNum - bNum;
          }
          return a.localeCompare(b);
        })
    : [];

  // Filter buses based on selected routes
  const filteredBuses = data?.buses && selectedRoutes.length > 0
    ? data.buses.filter(bus => selectedRoutes.includes(bus.routeShortName))
    : data?.buses || [];

  const toggleRoute = (route: string) => {
    setSelectedRoutes(prev => 
      prev.includes(route) 
        ? prev.filter(r => r !== route)
        : [...prev, route]
    );
  };

  const clearRouteFilters = () => {
    setSelectedRoutes([]);
  };

  if (!isMounted) {
    return <MapSkeleton />;
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <header className="bg-white shadow-sm z-[1000] relative">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div>
              <h1 
                className="text-xl font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2"
                onClick={handleRefresh}
                title={translations.map.refreshTitle}
              >
                Mapa de Autocarros ao Vivo
                {isRefreshing && (
                  <span className="animate-spin text-base">🔄</span>
                )}
              </h1>
              <p className="text-xs text-gray-600">
                {data ? (
                  <>
                    {translations.map.busesCount(filteredBuses.length)}
                    {selectedRoutes.length > 0 && <span className="text-gray-500"> / {data.buses.length} total</span>}
                  </>
                ) : translations.map.loading}
                {data && " • Atualiza a cada 30s"}
                {!isRefreshing && <span className="text-gray-400 ml-1">(clique no título para atualizar)</span>}
              </p>
            </div>
            <Link href="/stations" className="text-blue-600 hover:text-blue-800 font-medium text-sm">
              📍 {translations.nav.stations}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
          {/* Route Filter Dropdown */}
          {availableRoutes.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 max-h-[400px] overflow-y-auto">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
                <span className="font-semibold text-gray-700 text-sm">🚌 {translations.map.filterRoutes}</span>
                {selectedRoutes.length > 0 && (
                  <button
                    onClick={clearRouteFilters}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {translations.map.clearFilters}
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-500 mb-2">
                {selectedRoutes.length > 0 
                  ? translations.map.routesSelected(selectedRoutes.length)
                  : translations.map.allRoutes
                }
              </div>
              <div className="grid grid-cols-3 gap-2 max-w-[280px]">
                {availableRoutes.map(route => (
                  <button
                    key={route}
                    onClick={() => toggleRoute(route)}
                    className={`py-2 px-3 rounded-md text-sm font-semibold transition-all ${
                      selectedRoutes.includes(route)
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {route}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleLocateMe}
            disabled={isLocating}
            className="bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-lg shadow-lg border border-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={translations.map.centerMapTitle}
          >
            {isLocating ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">🔄</span>
                <span className="text-sm">Localizando...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>📍</span>
                <span className="text-sm">Minha Localização</span>
              </span>
            )}
          </button>

          <button
            onClick={() => setShowStops(!showStops)}
            disabled={!stopsData?.data?.stops}
            className={`font-semibold py-3 px-4 rounded-lg shadow-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              showStops
                ? "bg-red-500 hover:bg-red-600 text-white border-red-600"
                : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200"
            }`}
            title={
              !stopsData?.data?.stops 
                ? translations.map.stopsUnavailable 
                : showStops 
                  ? translations.map.hideStops 
                  : translations.map.showStops
            }
          >
            <span className="flex items-center gap-2">
              <span>{showStops ? "🚏" : "🚏"}</span>
              <span className="text-sm">{showStops ? translations.map.hideStops : translations.map.showStops}</span>
              {stopsData?.data?.stops && (
                <span className="text-xs opacity-75">({stopsData.data.stops.length})</span>
              )}
            </span>
          </button>
        </div>

        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-red-800 text-sm">{translations.map.errorLoadingBuses}</p>
          </div>
        )}

        {stopsError && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-[1000] bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-yellow-800 text-sm">{translations.map.stopsUnavailableError}</p>
          </div>
        )}

        {locationError && (
          <div className="absolute top-28 left-1/2 transform -translate-x-1/2 z-[1000] bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-yellow-800 text-sm">{locationError}</p>
          </div>
        )}

        {isLoading && !data && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] bg-white rounded-lg shadow-lg p-6">
            <p className="text-gray-600">{translations.map.loadingBusLocations}</p>
          </div>
        )}

        {data && stopsData?.data?.stops ? (
          <LeafletMap 
            buses={filteredBuses} 
            stops={stopsData.data.stops}
            userLocation={userLocation}
            showStops={showStops}
          />
        ) : data ? (
          <LeafletMap 
            buses={filteredBuses} 
            stops={[]}
            userLocation={userLocation}
            showStops={false}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <p className="text-gray-600">Initializing map...</p>
          </div>
        )}

        {data && data.buses.length === 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] bg-white rounded-lg shadow-lg p-6">
            <p className="text-gray-600">No buses currently tracked.</p>
          </div>
        )}
      </main>
    </div>
  );
}
