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

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Wrapper component that prevents re-initialization
function LeafletMap({
  buses,
  userLocation,
}: {
  buses: Bus[];
  userLocation: [number, number] | null;
}) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
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
        
        // Create custom icon with line number - simpler approach
        const busIcon = L.divIcon({
          html: `
            <div style="
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

        const marker = L.marker([bus.lat, bus.lon], { icon: busIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup(`
            <div class="bus-popup text-sm" style="min-width: 220px; font-family: system-ui, -apple-system, sans-serif;">
              <div style="font-size: 16px; font-weight: bold; color: #2563eb; margin-bottom: 8px;">
                Linha: ${bus.routeShortName}
              </div>
              ${bus.routeLongName ? `<div style="margin-bottom: 4px;"><strong>Destino:</strong> ${bus.routeLongName}</div>` : ''}
              <div style="margin-bottom: 4px;"><strong>Velocidade:</strong> ${bus.speed > 0 ? Math.round(bus.speed) + ' km/h' : 'Parado'}</div>
              ${bus.vehicleNumber ? `<div style="margin-bottom: 4px;"><strong>Veículo nº</strong> ${bus.vehicleNumber}</div>` : ''}
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

  const { data, error, isLoading } = useSWR<BusesResponse>("/api/buses", fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
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
              <h1 className="text-xl font-bold text-gray-900">Live Bus Map</h1>
              <p className="text-xs text-gray-600">
                {data ? `${data.buses.length} buses` : "Loading..."}
                {data && " • Updates every 30s"}
              </p>
            </div>
            <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium text-sm">
              ← Stations
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          className="absolute top-4 right-4 z-[1000] bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-lg shadow-lg border border-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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

        {data ? (
          <LeafletMap buses={data.buses} userLocation={userLocation} />
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
