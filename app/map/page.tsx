"use client";

import { useEffect, useState, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";

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
      console.log("Map not initialized yet");
      return;
    }
    
    if (buses.length === 0) {
      console.log("No buses data");
      return;
    }

    console.log(`Adding ${buses.length} bus markers to map`);

    import("leaflet").then((L) => {
      // Clear existing bus markers only (keep location marker)
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      // Add bus markers with line numbers
      buses.forEach((bus) => {
        console.log(`Adding marker for bus ${bus.routeShortName} at [${bus.lat}, ${bus.lon}]`);
        
        // Create custom icon with line number and tooltip showing destination
        const busIcon = L.divIcon({
          html: `
            <div style="
              position: relative;
              width: 48px;
              height: 32px;
              background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
              border: 2px solid white;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
              font-weight: bold;
              font-size: 14px;
              color: white;
              font-family: system-ui, -apple-system, sans-serif;
              cursor: pointer;
              transition: transform 0.2s;
            ">
              ${bus.routeShortName}
            </div>
          `,
          className: "custom-bus-marker",
          iconSize: [48, 32],
          iconAnchor: [24, 16],
          popupAnchor: [0, -16],
        });

        const destinationText = bus.routeLongName || 'Destino desconhecido';
        
        const marker = L.marker([bus.lat, bus.lon], { 
          icon: busIcon,
          title: `Linha ${bus.routeShortName} → ${destinationText}` // Tooltip on hover
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
      
      console.log(`Successfully added ${markersRef.current.length} markers`);
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

      console.log(`Adding ${stops.length} stop markers to map`);

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

      console.log(`Successfully added ${stopMarkersRef.current.length} stop markers`);
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

  const { data, error, isLoading, mutate } = useSWR<BusesResponse>("/api/buses", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  const { data: stopsData, error: stopsError } = useSWR<StopsResponse>("/api/stations", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const handleLocateMe = () => {
    setIsLocating(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
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
          console.log("Location permission denied - using default Porto location");
        } else {
          setLocationError("Unable to retrieve your location");
        }
        setIsLocating(false);
        console.error("Geolocation error:", error);
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
          console.log("Location refresh failed, keeping current location");
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

    // Import Leaflet CSS
    import("leaflet/dist/leaflet.css");

    // Automatically request user location on page load
    handleLocateMe();
  }, []);

  if (!isMounted) {
    return (
      <div className="h-screen w-screen flex flex-col bg-gradient-to-b from-blue-50 to-white">
        <header className="bg-white shadow-sm z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex justify-between items-center">
              <h1 className="text-xl font-bold text-gray-900">Live Bus Map</h1>
              <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                ← Stations
              </Link>
            </div>
          </div>
        </header>
        <div className="flex-1 flex justify-center items-center">
          <p className="text-gray-600">Loading map...</p>
        </div>
      </div>
    );
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
                title="Click to refresh buses and location"
              >
                Live Bus Map
                {isRefreshing && (
                  <span className="animate-spin text-base">🔄</span>
                )}
              </h1>
              <p className="text-xs text-gray-600">
                {data ? `${data.buses.length} buses` : "Loading..."}
                {data && " • Updates every 30s"}
                {!isRefreshing && <span className="text-gray-400 ml-1">(click title to refresh)</span>}
              </p>
            </div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium text-sm">
              ← Stations
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
          <button
            onClick={handleLocateMe}
            disabled={isLocating}
            className="bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-lg shadow-lg border border-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Center map on my location"
          >
            {isLocating ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">🔄</span>
                <span className="text-sm">Locating...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span>📍</span>
                <span className="text-sm">My Location</span>
              </span>
            )}
          </button>

          <button
            onClick={() => setShowStops(!showStops)}
            className={`font-semibold py-3 px-4 rounded-lg shadow-lg border transition-all ${
              showStops
                ? "bg-red-500 hover:bg-red-600 text-white border-red-600"
                : "bg-white hover:bg-gray-50 text-gray-700 border-gray-200"
            }`}
            title={showStops ? "Hide bus stops" : "Show bus stops"}
          >
            <span className="flex items-center gap-2">
              <span>{showStops ? "🚏" : "🚏"}</span>
              <span className="text-sm">{showStops ? "Hide Stops" : "Show Stops"}</span>
              {stopsData && (
                <span className="text-xs opacity-75">({stopsData.data.stops.length})</span>
              )}
            </span>
          </button>
        </div>

        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-red-800 text-sm">Failed to load bus data. Please try again later.</p>
          </div>
        )}

        {locationError && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[1000] bg-yellow-50 border border-yellow-200 rounded-lg p-3 shadow-lg max-w-md">
            <p className="text-yellow-800 text-sm">{locationError}</p>
          </div>
        )}

        {isLoading && !data && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000] bg-white rounded-lg shadow-lg p-6">
            <p className="text-gray-600">Loading bus locations...</p>
          </div>
        )}

        {data && stopsData ? (
          <LeafletMap 
            buses={data.buses} 
            stops={stopsData.data.stops}
            userLocation={userLocation}
            showStops={showStops}
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
