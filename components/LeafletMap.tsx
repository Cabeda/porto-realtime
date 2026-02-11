"use client";

import { useEffect, useState, useRef } from "react";
import type { Map as LMap, Marker, LatLngBounds, Polyline } from "leaflet";
import { logger } from "@/lib/logger";
import { escapeHtml } from "@/lib/sanitize";
import type { Bus, Stop, PatternGeometry } from "@/lib/types";

// Color palette for routes (vibrant colors that work in light and dark mode)
export const ROUTE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
];

export const getRouteColor = (routeShortName: string, selectedRoutes: string[]): string => {
  if (selectedRoutes.length === 0) return '#2563eb';
  const index = selectedRoutes.indexOf(routeShortName);
  return index === -1 ? '#2563eb' : ROUTE_COLORS[index % ROUTE_COLORS.length];
};

interface LeafletMapProps {
  buses: Bus[];
  allBuses: Bus[];
  stops: Stop[];
  userLocation: [number, number] | null;
  showStops: boolean;
  highlightedStationId: string | null;
  routePatterns: PatternGeometry[];
  selectedRoutes: string[];
  showRoutes: boolean;
  onSelectRoute?: (route: string) => void;
}

export function LeafletMap({
  buses,
  allBuses,
  stops,
  userLocation,
  showStops,
  highlightedStationId,
  routePatterns,
  selectedRoutes,
  showRoutes,
  onSelectRoute,
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LMap | null>(null);
  const busMarkersMapRef = useRef<Map<string, Marker>>(new Map());
  const stopMarkersRef = useRef<Marker[]>([]);
  const mapBoundsRef = useRef<LatLngBounds | null>(null);
  const locationMarkerRef = useRef<Marker | null>(null);
  const highlightedMarkerRef = useRef<Marker | null>(null);
  const routeLayersRef = useRef<Polyline[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    if (mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      const center = userLocation || [41.1579, -8.6291];
      const zoom = userLocation ? 15 : 13;

      const map = L.map(mapContainerRef.current).setView(center as [number, number], zoom);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      setIsMapReady(true);
      logger.log("Map initialized and ready");
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update bus markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (buses.length === 0) {
      busMarkersMapRef.current.forEach((marker) => marker.remove());
      busMarkersMapRef.current.clear();
      return;
    }

    import("leaflet").then((L) => {
      const currentBusIds = new Set(buses.map(b => b.id));

      // Remove stale markers
      busMarkersMapRef.current.forEach((marker, id) => {
        if (!currentBusIds.has(id)) {
          marker.remove();
          busMarkersMapRef.current.delete(id);
        }
      });

      buses.forEach((bus) => {
        const destinationText = bus.routeLongName || 'Destino desconhecido';
        const truncatedDestination = destinationText.length > 20
          ? destinationText.substring(0, 17) + '...'
          : destinationText;
        const routeColor = getRouteColor(bus.routeShortName, selectedRoutes);

        const iconHtml = `
          <div style="display:flex;align-items:center;gap:4px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
            <div style="min-width:44px;height:32px;background:${routeColor};border:2px solid white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;color:white;font-family:system-ui,sans-serif;cursor:pointer;padding:0 6px;box-shadow:0 1px 3px rgba(0,0,0,0.3);">
              ${escapeHtml(bus.routeShortName)}
            </div>
            <div style="background:rgba(255,255,255,0.98);border:1px solid #cbd5e1;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:600;color:#1e40af;font-family:system-ui,sans-serif;white-space:nowrap;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.2);max-width:150px;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(truncatedDestination)}
            </div>
          </div>`;

        const popupHtml = `
          <div class="bus-popup text-sm" style="min-width:240px;font-family:system-ui,sans-serif;">
            <div class="bus-popup-title">Linha ${escapeHtml(bus.routeShortName)}</div>
            <div class="bus-popup-destination">→ ${escapeHtml(destinationText)}</div>
            <div class="bus-popup-info"><strong>Velocidade:</strong> ${bus.speed > 0 ? Math.round(bus.speed) + ' km/h' : 'Parado'}</div>
            ${bus.vehicleNumber ? `<div class="bus-popup-info"><strong>Veículo nº</strong> ${escapeHtml(bus.vehicleNumber)}</div>` : ''}
            <div class="bus-popup-footer">Atualizado: ${new Date(bus.lastUpdated).toLocaleTimeString('pt-PT')}</div>
          </div>`;

        const busIcon = L.divIcon({
          html: iconHtml,
          className: "custom-bus-marker-with-destination",
          iconSize: [210, 32],
          iconAnchor: [24, 16],
          popupAnchor: [80, -16],
        });

        const existing = busMarkersMapRef.current.get(bus.id);
        if (existing) {
          existing.setLatLng([bus.lat, bus.lon]);
          existing.setIcon(busIcon);
          existing.setPopupContent(popupHtml);
        } else {
          const marker = L.marker([bus.lat, bus.lon], {
            icon: busIcon,
            title: `Linha ${bus.routeShortName} → ${destinationText}`
          })
            .addTo(mapInstanceRef.current!)
            .bindPopup(popupHtml);
          busMarkersMapRef.current.set(bus.id, marker);
        }
      });
    });
  }, [buses, isMapReady, selectedRoutes]);

  // Viewport-based stop rendering
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;

    const map = mapInstanceRef.current;

    const renderVisibleStops = () => {
      import("leaflet").then((L) => {
        stopMarkersRef.current.forEach((marker) => marker.remove());
        stopMarkersRef.current = [];

        if (!showStops || stops.length === 0) return;

        const bounds = map.getBounds();
        mapBoundsRef.current = bounds;

        stops
          .filter((stop) => bounds.contains([stop.lat, stop.lon]))
          .forEach((stop) => {
            const stopIcon = L.divIcon({
              html: `<div style="width:10px;height:10px;background:#ef4444;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4);cursor:pointer;"></div>`,
              className: "custom-stop-marker",
              iconSize: [10, 10],
              iconAnchor: [5, 5],
              popupAnchor: [0, -5],
            });

            const popupContent = `
                <div class="stop-popup text-sm" style="min-width:220px;max-width:280px;font-family:system-ui,sans-serif;">
                  <div class="stop-popup-title">${escapeHtml(stop.name)}</div>
                  <div id="departures-${stop.gtfsId.replace(/[^a-zA-Z0-9]/g, '_')}" style="margin:8px 0;">
                    <div style="color:#9ca3af;font-size:12px;">A carregar próximos...</div>
                  </div>
                  <a href="/station?gtfsId=${encodeURIComponent(stop.gtfsId)}" class="stop-popup-link">Ver todos os horários →</a>
                </div>
              `;

            const marker = L.marker([stop.lat, stop.lon], { icon: stopIcon })
              .addTo(map)
              .bindPopup(popupContent);

            marker.on('popupopen', () => {
              const containerId = `departures-${stop.gtfsId.replace(/[^a-zA-Z0-9]/g, '_')}`;
              const el = document.getElementById(containerId);
              if (!el) return;

              fetch(`/api/station?gtfsId=${encodeURIComponent(stop.gtfsId)}`)
                .then(r => r.json())
                .then(data => {
                  const deps = data?.data?.stop?.stoptimesWithoutPatterns || [];
                  const now = Date.now();
                  const upcoming = deps
                    .map((d: { serviceDay: number; realtimeDeparture: number; headsign?: string; realtime?: boolean; trip: { gtfsId: string; route: { shortName: string } } }) => ({
                      ...d,
                      departureMs: (d.serviceDay + d.realtimeDeparture) * 1000,
                    }))
                    .filter((d: { departureMs: number }) => d.departureMs > now)
                    .slice(0, 4);

                  if (upcoming.length === 0) {
                    el.innerHTML = '<div style="color:#9ca3af;font-size:12px;">Sem partidas próximas</div>';
                    return;
                  }

                  el.innerHTML = upcoming.map((d: { departureMs: number; realtime?: boolean; headsign?: string; trip: { gtfsId: string; route: { shortName: string } } }) => {
                    const mins = Math.round((d.departureMs - now) / 60000);
                    const timeStr = mins <= 0 ? '<1 min' : `${mins} min`;
                    const color = mins <= 2 ? '#ef4444' : mins <= 5 ? '#f59e0b' : '#3b82f6';
                    const rt = d.realtime ? '<span style="display:inline-block;width:6px;height:6px;background:#22c55e;border-radius:50%;margin-right:4px;vertical-align:middle;animation:rtpulse 1.5s ease-in-out infinite;"></span>' : '';
                    const tripIdPart = d.trip.gtfsId.replace(/^2:/, '');
                    return `<div data-trip-id="${escapeHtml(tripIdPart)}" data-route="${escapeHtml(d.trip.route.shortName)}" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;cursor:pointer;border-radius:4px;padding-left:4px;padding-right:4px;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                      <span><strong>${escapeHtml(d.trip.route.shortName)}</strong> <span style="color:#6b7280;">${escapeHtml(d.headsign || '')}</span></span>
                      <span style="display:inline-flex;align-items:center;color:${color};font-weight:600;white-space:nowrap;">${rt}${timeStr}</span>
                    </div>`;
                  }).join('');

                  // Attach click handlers to snap to bus on map
                  el.querySelectorAll('[data-trip-id]').forEach(row => {
                    row.addEventListener('click', () => {
                      const tripId = row.getAttribute('data-trip-id');
                      const route = row.getAttribute('data-route');
                      // Enable route filter if not already selected
                      if (route && selectedRoutes.length > 0 && !selectedRoutes.includes(route) && onSelectRoute) {
                        onSelectRoute(route);
                      }
                      // Match by trip ID first (exact), fall back to route name
                      // Use allBuses (unfiltered) since we just enabled the route
                      const matchingBus = allBuses.find(b => b.tripId === tripId)
                        || allBuses.find(b => b.routeShortName === route);
                      if (matchingBus) {
                        map.closePopup();
                        map.flyTo([matchingBus.lat, matchingBus.lon], 16, { duration: 0.8 });
                        setTimeout(() => {
                          const busMarker = busMarkersMapRef.current.get(matchingBus.id);
                          if (busMarker) busMarker.openPopup();
                        }, 900);
                      }
                    });
                  });
                })
                .catch(() => {
                  el.innerHTML = '<div style="color:#ef4444;font-size:12px;">Erro ao carregar</div>';
                });
            });
            stopMarkersRef.current.push(marker);
          });
      });
    };

    renderVisibleStops();
    map.on("moveend", renderVisibleStops);
    return () => { map.off("moveend", renderVisibleStops); };
  }, [stops, showStops, isMapReady]);

  // Fly to user location
  useEffect(() => {
    if (!userLocation || !mapInstanceRef.current || !isMapReady) return;

    import("leaflet").then((L) => {
      if (locationMarkerRef.current) locationMarkerRef.current.remove();

      const locationIcon = L.divIcon({
        html: `<div style="font-size:32px;text-align:center;line-height:1;">📍</div>`,
        className: "custom-location-icon",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      locationMarkerRef.current = L.marker(userLocation, { icon: locationIcon })
        .addTo(mapInstanceRef.current!)
        .bindPopup('<div class="text-sm"><div class="font-bold text-blue-600">Your Location</div></div>');

      mapInstanceRef.current!.flyTo(userLocation, 15, { duration: 1.5 });
    });
  }, [userLocation, isMapReady]);

  // Highlighted station
  useEffect(() => {
    if (!highlightedStationId || !mapInstanceRef.current || !isMapReady || stops.length === 0) {
      if (highlightedMarkerRef.current) {
        highlightedMarkerRef.current.remove();
        highlightedMarkerRef.current = null;
      }
      return;
    }

    const highlightedStop = stops.find((stop) => stop.gtfsId === highlightedStationId);
    if (!highlightedStop) return;

    import("leaflet").then((L) => {
      if (highlightedMarkerRef.current) highlightedMarkerRef.current.remove();

      const highlightedIcon = L.divIcon({
        html: `
          <div style="position:relative;">
            <div style="position:absolute;width:40px;height:40px;background:rgba(239,68,68,0.3);border-radius:50%;animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;top:50%;left:50%;transform:translate(-50%,-50%);"></div>
            <div style="position:absolute;width:20px;height:20px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);top:50%;left:50%;transform:translate(-50%,-50%);"></div>
          </div>
          <style>@keyframes pulse{0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1);}50%{opacity:0;transform:translate(-50%,-50%) scale(1.5);}}</style>
        `,
        className: "custom-highlighted-stop-marker",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
      });

      highlightedMarkerRef.current = L.marker([highlightedStop.lat, highlightedStop.lon], {
        icon: highlightedIcon,
        zIndexOffset: 1000
      })
        .addTo(mapInstanceRef.current!)
        .bindPopup(`
          <div class="stop-popup text-sm" style="min-width:200px;font-family:system-ui,sans-serif;">
            <div class="stop-popup-title">${escapeHtml(highlightedStop.name)}</div>
            ${highlightedStop.code ? `<div class="stop-popup-code"><strong>Código:</strong> ${escapeHtml(highlightedStop.code)}</div>` : ''}
            <a href="/station?gtfsId=${encodeURIComponent(highlightedStop.gtfsId)}" class="stop-popup-link" target="_blank">Ver Horários →</a>
          </div>
        `)
        .openPopup();

      mapInstanceRef.current!.flyTo([highlightedStop.lat, highlightedStop.lon], 17, { duration: 1.5 });
    });
  }, [highlightedStationId, stops, isMapReady]);

  // Route polylines
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady || !routePatterns || routePatterns.length === 0) return;

    import("leaflet").then((L) => {
      routeLayersRef.current.forEach((layer) => layer.remove());
      routeLayersRef.current = [];

      if (!showRoutes || selectedRoutes.length === 0) return;

      const routeColorMap = new Map<string, string>();
      selectedRoutes.forEach((route, index) => {
        routeColorMap.set(route, ROUTE_COLORS[index % ROUTE_COLORS.length]);
      });

      routePatterns
        .filter((pattern) => selectedRoutes.includes(pattern.routeShortName))
        .forEach((pattern) => {
          const color = routeColorMap.get(pattern.routeShortName) || '#3b82f6';
          const latLngs = pattern.geometry.coordinates.map(
            (coord) => [coord[1], coord[0]] as [number, number]
          );

          const polyline = L.polyline(latLngs, {
            color, weight: 4, opacity: 0.7, smoothFactor: 1,
          })
            .addTo(mapInstanceRef.current!)
            .bindPopup(`
              <div class="route-popup text-sm" style="min-width:200px;font-family:system-ui,sans-serif;">
                <div class="route-popup-title" style="color:${color};">Linha ${pattern.routeShortName}</div>
                <div class="route-popup-headsign">→ ${pattern.headsign}</div>
                <div class="route-popup-desc">${pattern.routeLongName}</div>
              </div>
            `);

          polyline.bringToBack();
          routeLayersRef.current.push(polyline);
        });

      logger.log(`Rendered ${routeLayersRef.current.length} route polylines`);
    });
  }, [routePatterns, selectedRoutes, showRoutes, isMapReady]);

  return <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />;
}
