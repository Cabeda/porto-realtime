"use client";

import { useEffect, useState, useRef, useMemo } from "react";
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

// --- Snap-to-route helpers ---

function nearestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): [number, number] {
  // Perform projection in an equirectangular-like space where longitude is
  // scaled by cos(latitude), to match the distance metric used elsewhere.
  const rad = Math.PI / 180;
  const cosLat = Math.cos(py * rad);

  // If cosLat is 0 (at the poles), fall back to unscaled degrees to avoid
  // division-by-zero; distances are degenerate there anyway.
  const scale = cosLat === 0 ? 1 : cosLat;

  // Convert to scaled coordinates: x = lon * scale, y = lat.
  const pxScaled = px * scale;
  const pyScaled = py;
  const axScaled = ax * scale;
  const ayScaled = ay;
  const bxScaled = bx * scale;
  const byScaled = by;

  const dx = bxScaled - axScaled;
  const dy = byScaled - ayScaled;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Degenerate segment: return the single endpoint.
    return [ax, ay];
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((pxScaled - axScaled) * dx + (pyScaled - ayScaled) * dy) / lenSq,
    ),
  );

  const projXScaled = axScaled + t * dx;
  const projYScaled = ayScaled + t * dy;

  // Convert back from scaled coordinates to lon/lat degrees.
  const projLon = scale === 0 ? ax : projXScaled / scale;
  const projLat = projYScaled;

  return [projLon, projLat];
}

/** Snap a lat/lon to the nearest point on any polyline for the given route. Returns original position if no route within 150 m. */
function snapToRoute(
  lat: number, lon: number,
  routeShortName: string,
  routePatternsMap: Map<string, PatternGeometry[]>,
  busId: string,
  segmentMap: Map<string, { pIdx: number; sIdx: number }>,
): [number, number] {
  const routePs = routePatternsMap.get(routeShortName);
  if (!routePs || routePs.length === 0) return [lat, lon];

  const cosLat = Math.cos(lat * Math.PI / 180);
  const distSq = (nlat: number, nlon: number) => {
    const dLat = (nlat - lat) * 111_320;
    const dLon = (nlon - lon) * 111_320 * cosLat;
    return dLat * dLat + dLon * dLon;
  };

  // Local search around last known segment (±15 segments, 50 m threshold)
  const hint = segmentMap.get(busId);
  if (hint && hint.pIdx < routePs.length) {
    const coords = routePs[hint.pIdx].geometry.coordinates;
    const lo = Math.max(0, hint.sIdx - 15);
    const hi = Math.min(coords.length - 1, hint.sIdx + 15);
    let bestD = Infinity, bestPt: [number, number] = [lat, lon], bestS = hint.sIdx;
    for (let i = lo; i < hi; i++) {
      const [nl, no] = nearestPointOnSegment(lat, lon, coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
      const d = distSq(nl, no);
      if (d < bestD) { bestD = d; bestPt = [nl, no]; bestS = i; }
    }
    if (bestD <= 50 * 50) { segmentMap.set(busId, { pIdx: hint.pIdx, sIdx: bestS }); return bestPt; }
  }

  // Global search across all patterns (150 m threshold)
  let bestD = Infinity, best: [number, number] = [lat, lon], bestP = 0, bestS = 0;
  for (let pi = 0; pi < routePs.length; pi++) {
    const coords = routePs[pi].geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const [nl, no] = nearestPointOnSegment(lat, lon, coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
      const d = distSq(nl, no);
      if (d < bestD) { bestD = d; best = [nl, no]; bestP = pi; bestS = i; }
    }
  }
  if (bestD <= 150 * 150) { segmentMap.set(busId, { pIdx: bestP, sIdx: bestS }); return best; }
  return [lat, lon];
}

const ANIM_DURATION = 1500; // ms

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
  const animFramesRef = useRef<Map<string, number>>(new Map());
  const busSegmentRef = useRef<Map<string, { pIdx: number; sIdx: number }>>(new Map());
  const [isMapReady, setIsMapReady] = useState(false);

  // Pre-group route patterns by routeShortName for efficient lookup
  const routePatternsMap = useMemo(() => {
    const map = new Map<string, PatternGeometry[]>();
    for (const pattern of routePatterns) {
      const existing = map.get(pattern.routeShortName);
      if (existing) {
        existing.push(pattern);
      } else {
        map.set(pattern.routeShortName, [pattern]);
      }
    }
    return map;
  }, [routePatterns]);

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

      // Event delegation on map container for bus popup rate buttons.
      // This is more reliable than attaching listeners on popupopen because
      // Leaflet can replace popup DOM elements when content is updated.
      mapContainerRef.current!.addEventListener("click", (e) => {
        const target = (e.target as HTMLElement).closest("[data-rate-line]");
        if (target) {
          const routeShortName = target.getAttribute("data-rate-line");
          if (routeShortName) {
            window.dispatchEvent(
              new CustomEvent("open-line-feedback", {
                detail: { routeShortName },
              })
            );
          }
          return;
        }
        const vehicleTarget = (e.target as HTMLElement).closest("[data-rate-vehicle]");
        if (vehicleTarget) {
          const vehicleNumber = vehicleTarget.getAttribute("data-rate-vehicle");
          const lineContext = vehicleTarget.getAttribute("data-vehicle-line");
          if (vehicleNumber) {
            window.dispatchEvent(
              new CustomEvent("open-vehicle-feedback", {
                detail: { vehicleNumber, lineContext },
              })
            );
          }
        }
      });
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
      // Cancel all running animations
      animFramesRef.current.forEach((frameId) => cancelAnimationFrame(frameId));
      animFramesRef.current.clear();
      // Clear all segment hints
      busSegmentRef.current.clear();
      // Remove all markers
      busMarkersMapRef.current.forEach((marker) => marker.remove());
      busMarkersMapRef.current.clear();
      return;
    }

    import("leaflet").then((L) => {
      const currentBusIds = new Set(buses.map(b => b.id));

      // Remove stale markers
      busMarkersMapRef.current.forEach((marker, id) => {
        if (!currentBusIds.has(id)) {
          const af = animFramesRef.current.get(id);
          if (af) { cancelAnimationFrame(af); animFramesRef.current.delete(id); }
          busSegmentRef.current.delete(id);
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
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button data-rate-line="${escapeHtml(bus.routeShortName)}" class="bus-popup-rate-btn" style="flex:1;padding:6px 12px;background:#eab308;color:white;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">★ Linha ${escapeHtml(bus.routeShortName)}</button>
              ${bus.vehicleNumber ? `<button data-rate-vehicle="${escapeHtml(bus.vehicleNumber)}" data-vehicle-line="${escapeHtml(bus.routeShortName)}" class="bus-popup-rate-btn" style="flex:1;padding:6px 12px;background:#6366f1;color:white;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">★ Bus ${escapeHtml(bus.vehicleNumber)}</button>` : ''}
            </div>
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
          // Snap target to route if polylines available
          const target = snapToRoute(bus.lat, bus.lon, bus.routeShortName, routePatternsMap, bus.id, busSegmentRef.current);
          const cur = existing.getLatLng();

          // Cancel any running animation for this bus
          const prev = animFramesRef.current.get(bus.id);
          if (prev !== undefined) {
            cancelAnimationFrame(prev);
            animFramesRef.current.delete(bus.id);
          }

          const dLat = target[0] - cur.lat;
          const dLon = target[1] - cur.lng;
          // Skip animation for large jumps (>500m) — likely GPS error or reassignment
          const jumpM = Math.sqrt((dLat * 111_320) ** 2 + (dLon * 111_320 * Math.cos(cur.lat * Math.PI / 180)) ** 2);
          if (jumpM > 500) {
            existing.setLatLng(target);
          } else if (dLat * dLat + dLon * dLon > 1e-12) {
            const t0 = performance.now();
            const step = (now: number) => {
              const p = Math.min((now - t0) / ANIM_DURATION, 1);
              const e = 1 - (1 - p) * (1 - p) * (1 - p); // ease-out cubic
              existing.setLatLng([cur.lat + dLat * e, cur.lng + dLon * e]);
              if (p < 1) animFramesRef.current.set(bus.id, requestAnimationFrame(step));
              else animFramesRef.current.delete(bus.id);
            };
            animFramesRef.current.set(bus.id, requestAnimationFrame(step));
          }

          existing.setIcon(busIcon);
          existing.setPopupContent(popupHtml);
        } else {
          const snapped = snapToRoute(bus.lat, bus.lon, bus.routeShortName, routePatternsMap, bus.id, busSegmentRef.current);
          const marker = L.marker(snapped, {
            icon: busIcon,
            title: `Linha ${bus.routeShortName} → ${destinationText}`
          })
            .addTo(mapInstanceRef.current!)
            .bindPopup(popupHtml);
          busMarkersMapRef.current.set(bus.id, marker);
        }
      });
    });
  }, [buses, isMapReady, selectedRoutes, routePatterns]);

  // Viewport-based stop rendering
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;

    const map = mapInstanceRef.current;

    const renderVisibleStops = () => {
      import("leaflet").then((L) => {
        stopMarkersRef.current.forEach((marker) => marker.remove());
        stopMarkersRef.current = [];

        if (!showStops || stops.length === 0 || map.getZoom() < 15) return;

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
                .then((r) => {
                  if (!r.ok) {
                    throw new Error(`Failed to load station data (status ${r.status})`);
                  }
                  return r.json();
                })
                .then((data) => {
                  if (!data?.data?.stop) {
                    throw new Error("Invalid station data");
                  }

                  const deps = data.data.stop.stoptimesWithoutPatterns || [];
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
                    const mins = Math.floor((d.departureMs - now) / 60000);
                    const timeStr = mins <= 0 ? '&lt;1 min' : `${mins} min`;
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
