"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import "leaflet/dist/leaflet.css";
import { translations } from "@/lib/translations";
import { logger } from "@/lib/logger";
import { MapSkeleton } from "@/components/LoadingSkeletons";
import { storage } from "@/lib/storage";
import { DarkModeToggle } from "@/components/DarkModeToggle";

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

interface PatternGeometry {
  patternId: string;
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  directionId: number;
  geometry: {
    type: string;
    coordinates: [number, number][];
  };
}

interface RoutePatternsResponse {
  patterns: PatternGeometry[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Fetcher with localStorage fallback for buses (short cache for instant load)
const busesFetcher = async (url: string): Promise<BusesResponse> => {
  // Try to get from localStorage first (instant load)
  const cached = storage.get<BusesResponse>("cachedBuses");
  
  // If we have cached data, return it immediately while fetching fresh data in background
  if (cached) {
    logger.log("Loading buses from localStorage cache");
    
    // Fetch fresh data in background (don't await)
    fetch(url)
      .then((res) => res.json())
      .then((freshData) => {
        // Update cache with fresh data
        storage.set("cachedBuses", freshData, 0.033); // Expire in ~2 minutes (0.033 days)
        logger.log("Updated buses cache with fresh data");
      })
      .catch((err) => {
        logger.error("Failed to update buses cache:", err);
      });
    
    return cached;
  }
  
  // No cache - fetch from network
  logger.log("Fetching buses from network (first time)");
  const response = await fetch(url);
  const data = await response.json();
  
  // Store in localStorage for next time
  storage.set("cachedBuses", data, 0.033); // Expire in ~2 minutes
  
  return data;
};

// Fetcher with localStorage fallback for stations (they change infrequently)
const stationsFetcher = async (url: string): Promise<StopsResponse> => {
  // Try to get from localStorage first (instant load)
  const cached = storage.get<StopsResponse>("cachedStations");
  
  // If we have cached data, return it immediately while fetching fresh data in background
  if (cached) {
    logger.log("Loading stations from localStorage cache");
    
    // Fetch fresh data in background (don't await)
    fetch(url)
      .then((res) => res.json())
      .then((freshData) => {
        // Update cache with fresh data
        storage.set("cachedStations", freshData, 7); // Expire in 7 days
        logger.log("Updated stations cache with fresh data");
      })
      .catch((err) => {
        logger.error("Failed to update stations cache:", err);
      });
    
    return cached;
  }
  
  // No cache - fetch from network
  logger.log("Fetching stations from network (first time)");
  const response = await fetch(url);
  const data = await response.json();
  
  // Store in localStorage for next time
  storage.set("cachedStations", data, 7); // Expire in 7 days
  
  return data;
};

// Color palette for routes (vibrant colors that work in light and dark mode)
const ROUTE_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
  '#84cc16', // lime
];

// Helper function to get color for a route based on selected routes
const getRouteColor = (routeShortName: string, selectedRoutes: string[]): string => {
  if (selectedRoutes.length === 0) {
    // Default color when no filters applied
    return '#2563eb';
  }
  const index = selectedRoutes.indexOf(routeShortName);
  if (index === -1) {
    // Route not selected, use default
    return '#2563eb';
  }
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
};

// Wrapper component that prevents re-initialization
function LeafletMap({
  buses,
  stops,
  userLocation,
  showStops,
  highlightedStationId,
  routePatterns,
  selectedRoutes,
  showRoutes,
}: {
  buses: Bus[];
  stops: Stop[];
  userLocation: [number, number] | null;
  showStops: boolean;
  highlightedStationId: string | null;
  routePatterns: PatternGeometry[];
  selectedRoutes: string[];
  showRoutes: boolean;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const stopMarkersRef = useRef<any[]>([]);
  const locationMarkerRef = useRef<any>(null);
  const highlightedMarkerRef = useRef<any>(null);
  const routeLayersRef = useRef<any[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);

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

      // Mark map as ready to trigger bus markers rendering
      setIsMapReady(true);
      logger.log("Map initialized and ready");
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
    logger.log(`Bus markers useEffect triggered. Buses array length: ${buses.length}, Map initialized: ${!!mapInstanceRef.current}`);
    
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
        
        const destinationText = bus.routeLongName || 'Destino desconhecido';
        
        // Truncate destination for display (keep it short for mobile)
        const truncatedDestination = destinationText.length > 20 
          ? destinationText.substring(0, 17) + '...' 
          : destinationText;
        
        // Get route color based on selected routes
        const routeColor = getRouteColor(bus.routeShortName, selectedRoutes);
        
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
                background: ${routeColor};
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
              <div class="bus-popup-title">
                Linha ${bus.routeShortName}
              </div>
              <div class="bus-popup-destination">
                → ${destinationText}
              </div>
              <div class="bus-popup-info"><strong>Velocidade:</strong> ${bus.speed > 0 ? Math.round(bus.speed) + ' km/h' : '🛑 Parado'}</div>
              ${bus.vehicleNumber ? `<div class="bus-popup-info"><strong>Veículo nº</strong> ${bus.vehicleNumber}</div>` : ''}
              <div class="bus-popup-footer">
                Atualizado: ${new Date(bus.lastUpdated).toLocaleTimeString('pt-PT')}
              </div>
            </div>
          `);
        markersRef.current.push(marker);
      });
      
    });
  }, [buses, isMapReady, selectedRoutes]); // Re-render when route selection changes to update colors

  // Update stop markers when stops or showStops change
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) {
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
              <div class="stop-popup-title">
                ${stop.name}
              </div>
              ${stop.code ? `<div class="stop-popup-code"><strong>Código:</strong> ${stop.code}</div>` : ''}
              ${stop.desc ? `<div class="stop-popup-desc">${stop.desc}</div>` : ''}
              <a href="/station?gtfsId=${stop.gtfsId}" 
                 class="stop-popup-link"
                 target="_blank">
                Ver Horários →
              </a>
            </div>
          `);
        stopMarkersRef.current.push(marker);
      });

      logger.log(`Successfully added ${stopMarkersRef.current.length} stop markers`);
    });
  }, [stops, showStops, isMapReady]);

  // Fly to location when it changes
  useEffect(() => {
    if (!userLocation || !mapInstanceRef.current || !isMapReady) return;

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
  }, [userLocation, isMapReady]);

  // Handle highlighted station
  useEffect(() => {
    if (!highlightedStationId || !mapInstanceRef.current || !isMapReady || stops.length === 0) {
      // Remove highlighted marker if no station is highlighted
      if (highlightedMarkerRef.current) {
        highlightedMarkerRef.current.remove();
        highlightedMarkerRef.current = null;
      }
      return;
    }

    const highlightedStop = stops.find((stop) => stop.gtfsId === highlightedStationId);
    if (!highlightedStop) return;

    import("leaflet").then((L) => {
      // Remove old highlighted marker if exists
      if (highlightedMarkerRef.current) {
        highlightedMarkerRef.current.remove();
      }

      // Create pulsing icon for highlighted station
      const highlightedIcon = L.divIcon({
        html: `
          <div style="position: relative;">
            <!-- Pulsing ring -->
            <div style="
              position: absolute;
              width: 40px;
              height: 40px;
              background: rgba(239, 68, 68, 0.3);
              border-radius: 50%;
              animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
            "></div>
            <!-- Inner dot -->
            <div style="
              position: absolute;
              width: 20px;
              height: 20px;
              background: #ef4444;
              border: 3px solid white;
              border-radius: 50%;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
            "></div>
          </div>
          <style>
            @keyframes pulse {
              0%, 100% {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
              }
              50% {
                opacity: 0;
                transform: translate(-50%, -50%) scale(1.5);
              }
            }
          </style>
        `,
        className: "custom-highlighted-stop-marker",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
      });

      highlightedMarkerRef.current = L.marker([highlightedStop.lat, highlightedStop.lon], { 
        icon: highlightedIcon,
        zIndexOffset: 1000 // Ensure it's above other markers
      })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div class="stop-popup text-sm" style="min-width: 200px; font-family: system-ui, -apple-system, sans-serif;">
            <div class="stop-popup-title">
              ${highlightedStop.name}
            </div>
            ${highlightedStop.code ? `<div class="stop-popup-code"><strong>Código:</strong> ${highlightedStop.code}</div>` : ''}
            ${highlightedStop.desc ? `<div class="stop-popup-desc">${highlightedStop.desc}</div>` : ''}
            <a href="/station?gtfsId=${highlightedStop.gtfsId}" 
               class="stop-popup-link"
               target="_blank">
              Ver Horários →
            </a>
          </div>
        `)
        .openPopup(); // Auto-open the popup

      // Fly to highlighted station
      mapInstanceRef.current.flyTo([highlightedStop.lat, highlightedStop.lon], 17, { duration: 1.5 });
    });
  }, [highlightedStationId, stops, isMapReady]);

  // Update route polylines when selected routes or patterns change
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady || !routePatterns || routePatterns.length === 0) {
      return;
    }

    import("leaflet").then((L) => {
      // Clear existing route layers
      routeLayersRef.current.forEach((layer) => layer.remove());
      routeLayersRef.current = [];

      // If route visualization is disabled or no routes selected, stop here
      if (!showRoutes || selectedRoutes.length === 0) {
        return;
      }

      logger.log(`Rendering ${selectedRoutes.length} route paths`);

      // Use shared color mapping
      const routeColorMap = new Map<string, string>();
      selectedRoutes.forEach((route, index) => {
        routeColorMap.set(route, ROUTE_COLORS[index % ROUTE_COLORS.length]);
      });

      // Filter patterns for selected routes
      const relevantPatterns = routePatterns.filter((pattern) =>
        selectedRoutes.includes(pattern.routeShortName)
      );

      logger.log(`Found ${relevantPatterns.length} patterns for selected routes`);

      // Draw polylines for each pattern
      relevantPatterns.forEach((pattern) => {
        const color = routeColorMap.get(pattern.routeShortName) || '#3b82f6';
        
        // Convert coordinates from [lon, lat] to [lat, lon] for Leaflet
        const latLngs = pattern.geometry.coordinates.map(
          (coord) => [coord[1], coord[0]] as [number, number]
        );

        const polyline = L.polyline(latLngs, {
          color: color,
          weight: 4,
          opacity: 0.7,
          smoothFactor: 1,
        })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="route-popup text-sm" style="min-width: 200px; font-family: system-ui, -apple-system, sans-serif;">
              <div class="route-popup-title" style="color: ${color};">
                Linha ${pattern.routeShortName}
              </div>
              <div class="route-popup-headsign">
                → ${pattern.headsign}
              </div>
              <div class="route-popup-desc">
                ${pattern.routeLongName}
              </div>
            </div>
          `);

        // Send route layers to back so they don't cover markers
        polyline.bringToBack();
        routeLayersRef.current.push(polyline);
      });

      logger.log(`Successfully rendered ${routeLayersRef.current.length} route polylines`);
    });
  }, [routePatterns, selectedRoutes, showRoutes, isMapReady]);

  return <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />;
}

function MapPageContent() {
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showStops, setShowStops] = useState(false);
  const [showStopsInitialized, setShowStopsInitialized] = useState(false);
  const [showRoutes, setShowRoutes] = useState(true); // Show routes by default
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showRouteFilter, setShowRouteFilter] = useState(false); // Collapsible route filter
  const [lastRefreshTime, setLastRefreshTime] = useState(0); // Track last manual refresh
  
  // Get highlighted station from URL params (e.g., /?station=2:BRRS2)
  const highlightedStationId = searchParams?.get("station");
  
  // Load selected routes from localStorage on mount
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("selectedRoutes");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const { data, error, isLoading, mutate } = useSWR<BusesResponse>("/api/buses", busesFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  // Stations/stops change infrequently - use localStorage cache for instant loads
  const { data: stopsData, error: stopsError } = useSWR<StopsResponse>(
    "/api/stations",
    stationsFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
      revalidateIfStale: false,
      // fallbackData will be loaded from localStorage synchronously via stationsFetcher
    }
  );

  // Fetch route patterns (cached for 24 hours server-side)
  const { data: routePatternsData } = useSWR<RoutePatternsResponse>(
    "/api/route-shapes",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 24 * 60 * 60 * 1000, // 24 hours
    }
  );

  // Auto-enable stops display once data is loaded (only on initial load)
  useEffect(() => {
    if (stopsData?.data?.stops && !showStopsInitialized) {
      setShowStops(true);
      setShowStopsInitialized(true);
    }
  }, [stopsData, showStopsInitialized]);

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
    // Prevent refresh spam - require at least 5 seconds between manual refreshes
    const now = Date.now();
    if (now - lastRefreshTime < 5000) {
      return;
    }
    
    setIsRefreshing(true);
    setLastRefreshTime(now);
    
    // Refresh bus data only (location has its own button)
    await mutate();
    
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

  // Log when bus data changes
  useEffect(() => {
    logger.log(`Bus data updated. Total buses: ${data?.buses?.length || 0}, Filtered buses: ${filteredBuses.length}, Selected routes: ${selectedRoutes.length}`);
  }, [data, filteredBuses.length, selectedRoutes.length]);

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
                {isRefreshing && (
                  <span className="animate-spin text-base">🔄</span>
                )}
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {data ? (
                  <>
                    {filteredBuses.length} {filteredBuses.length === 1 ? 'autocarro' : 'autocarros'}
                    {selectedRoutes.length > 0 && <span className="text-gray-500 dark:text-gray-500"> / {data.buses.length}</span>}
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
        {/* Floating Location Button (Google Maps style) - Always visible */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          className="absolute bottom-6 right-4 z-[1001] w-12 h-12 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-full shadow-lg border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title={translations.map.centerMapTitle}
        >
          {isLocating ? (
            <span className="animate-spin text-xl">🔄</span>
          ) : (
            <span className="text-xl">📍</span>
          )}
        </button>

        {/* Top-right controls */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 max-w-[calc(100vw-2rem)]">
          {/* Route Filter - Collapsible */}
          {availableRoutes.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowRouteFilter(!showRouteFilter)}
                className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg transition-colors"
              >
                <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm flex items-center gap-2">
                  🚌 Filtrar Linhas
                  {selectedRoutes.length > 0 && (
                    <span className="text-xs bg-blue-600 dark:bg-blue-500 text-white px-2 py-0.5 rounded-full">
                      {selectedRoutes.length}
                    </span>
                  )}
                </span>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  {showRouteFilter ? '▲' : '▼'}
                </span>
              </button>
              
              {showRouteFilter && (
                <div className="p-3 pt-0 border-t border-gray-200 dark:border-gray-700 max-h-[calc(100vh-12rem)] overflow-y-auto">
                  <div className="flex items-center justify-between mb-2 pt-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedRoutes.length > 0 
                        ? `${selectedRoutes.length} linha${selectedRoutes.length > 1 ? 's' : ''} selecionada${selectedRoutes.length > 1 ? 's' : ''}`
                        : 'Todas as linhas'
                      }
                    </div>
                    {selectedRoutes.length > 0 && (
                      <button
                        onClick={clearRouteFilters}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {availableRoutes.map(route => (
                      <button
                        key={route}
                        onClick={() => toggleRoute(route)}
                        className={`py-2 px-3 rounded-md text-sm font-semibold transition-all ${
                          selectedRoutes.includes(route)
                            ? "bg-blue-600 dark:bg-blue-500 text-white shadow-md"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        {route}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Other controls - compact */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowStops(!showStops)}
              disabled={!stopsData?.data?.stops}
              className={`flex-1 font-semibold py-2 px-3 rounded-lg shadow-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm ${
                showStops
                  ? "bg-red-500 hover:bg-red-600 text-white border-red-600 dark:border-red-500"
                  : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700"
              }`}
              title={
                !stopsData?.data?.stops 
                  ? translations.map.stopsUnavailable 
                  : showStops 
                    ? translations.map.hideStops 
                    : translations.map.showStops
              }
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
              title={
                selectedRoutes.length === 0
                  ? "Selecione linhas para ver caminhos"
                  : showRoutes
                    ? "Ocultar Caminhos"
                    : "Mostrar Caminhos"
              }
            >
              🛣️ {showRoutes ? 'Ocultar' : 'Caminhos'}
            </button>
          </div>
        </div>

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
            <p className="text-gray-600 dark:text-gray-300">{translations.map.loadingBusLocations}</p>
          </div>
        )}

        {data && stopsData?.data?.stops ? (
          <LeafletMap 
            buses={filteredBuses} 
            stops={stopsData.data.stops}
            userLocation={userLocation}
            showStops={showStops}
            highlightedStationId={highlightedStationId || null}
            routePatterns={routePatternsData?.patterns || []}
            selectedRoutes={selectedRoutes}
            showRoutes={showRoutes}
          />
        ) : data ? (
          <LeafletMap 
            buses={filteredBuses} 
            stops={[]}
            userLocation={userLocation}
            showStops={false}
            highlightedStationId={null}
            routePatterns={routePatternsData?.patterns || []}
            selectedRoutes={selectedRoutes}
            showRoutes={showRoutes}
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

        {/* About Modal */}
        {showAboutModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-[2000] flex items-center justify-center p-4"
            onClick={() => setShowAboutModal(false)}
          >
            <div 
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sobre o Projeto</h2>
                <button
                  onClick={() => setShowAboutModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4 text-gray-700 dark:text-gray-300">
                <p>
                  <strong>Porto Explore</strong> é uma aplicação web que fornece informações de transportes públicos em tempo real para o Porto, Portugal.
                </p>
                
                <div>
                  <p className="font-semibold mb-2">Desenvolvido por:</p>
                  <p>José Cabeda</p>
                </div>

                <div>
                  <p className="font-semibold mb-2">Características:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Localização de autocarros em tempo real</li>
                    <li>Horários de paragens</li>
                    <li>Visualização de rotas</li>
                    <li>Modo escuro</li>
                    <li>PWA com suporte offline</li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <a
                    href="https://github.com/Cabeda/porto-realtime"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    Ver no GitHub
                  </a>
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 pt-2">
                  Dados fornecidos pela API OpenTripPlanner do Porto
                </div>
              </div>
            </div>
          </div>
        )}
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
