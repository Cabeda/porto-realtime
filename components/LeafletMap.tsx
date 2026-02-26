"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import type { Map as LMap, Marker, LatLngBounds, Polyline, TileLayer as LTileLayer } from "leaflet";
import { logger } from "@/lib/logger";
import { escapeHtml } from "@/lib/sanitize";
import { toTitleCase } from "@/lib/strings";
import { storage } from "@/lib/storage";
import type {
  Bus,
  Stop,
  PatternGeometry,
  BikePark,
  BikeLane,
  ActiveCheckIn,
  RouteInfo,
} from "@/lib/types";

// Color palette for routes (vibrant colors that work in light and dark mode)
const ROUTE_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
];

const getRouteColor = (
  routeShortName: string,
  selectedRoutes: string[],
  routeInfos?: RouteInfo[]
): string => {
  // Prefer the official GTFS color from OTP (stored without leading #)
  const info = routeInfos?.find((r) => r.shortName === routeShortName);
  if (info?.color) return `#${info.color}`;

  // Fall back to palette: use selection index when filtered, hash when showing all
  if (selectedRoutes.length > 0) {
    const index = selectedRoutes.indexOf(routeShortName);
    return index === -1 ? "#2563eb" : (ROUTE_COLORS[index % ROUTE_COLORS.length] ?? "#2563eb");
  }
  let hash = 0;
  for (let i = 0; i < routeShortName.length; i++) {
    hash = (hash * 31 + routeShortName.charCodeAt(i)) >>> 0;
  }
  return ROUTE_COLORS[hash % ROUTE_COLORS.length] ?? "#2563eb";
};

// --- Snap-to-route helpers ---

function nearestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
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
    Math.min(1, ((pxScaled - axScaled) * dx + (pyScaled - ayScaled) * dy) / lenSq)
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
  lat: number,
  lon: number,
  routeShortName: string,
  routePatternsMap: Map<string, PatternGeometry[]>,
  busId: string,
  segmentMap: Map<string, { pIdx: number; sIdx: number }>
): [number, number] {
  const routePs = routePatternsMap.get(routeShortName);
  if (!routePs || routePs.length === 0) return [lat, lon];

  const cosLat = Math.cos((lat * Math.PI) / 180);
  const distSq = (nlat: number, nlon: number) => {
    const dLat = (nlat - lat) * 111_320;
    const dLon = (nlon - lon) * 111_320 * cosLat;
    return dLat * dLat + dLon * dLon;
  };

  // Local search around last known segment (±15 segments, 50 m threshold)
  const hint = segmentMap.get(busId);
  if (hint && hint.pIdx < routePs.length) {
    const coords = routePs[hint.pIdx]!.geometry.coordinates;
    const lo = Math.max(0, hint.sIdx - 15);
    const hi = Math.min(coords.length - 1, hint.sIdx + 15);
    let bestD = Infinity,
      bestPt: [number, number] = [lat, lon],
      bestS = hint.sIdx;
    for (let i = lo; i < hi; i++) {
      const c = coords[i]!;
      const cn = coords[i + 1]!;
      const [nl, no] = nearestPointOnSegment(lat, lon, c[1], c[0], cn[1], cn[0]);
      const d = distSq(nl, no);
      if (d < bestD) {
        bestD = d;
        bestPt = [nl, no];
        bestS = i;
      }
    }
    if (bestD <= 50 * 50) {
      segmentMap.set(busId, { pIdx: hint.pIdx, sIdx: bestS });
      return bestPt;
    }
  }

  // Global search across all patterns (150 m threshold)
  let bestD = Infinity,
    best: [number, number] = [lat, lon],
    bestP = 0,
    bestS = 0;
  for (let pi = 0; pi < routePs.length; pi++) {
    const coords = routePs[pi]!.geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const c = coords[i]!;
      const cn = coords[i + 1]!;
      const [nl, no] = nearestPointOnSegment(lat, lon, c[1], c[0], cn[1], cn[0]);
      const d = distSq(nl, no);
      if (d < bestD) {
        bestD = d;
        best = [nl, no];
        bestP = pi;
        bestS = i;
      }
    }
  }
  if (bestD <= 150 * 150) {
    segmentMap.set(busId, { pIdx: bestP, sIdx: bestS });
    return best;
  }
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
  bikeParks?: BikePark[];
  bikeLanes?: BikeLane[];
  showBikeParks?: boolean;
  showBikeLanes?: boolean;
  selectedBikeLanes?: string[];
  mapStyle?: string;
  onMapReady?: (map: LMap) => void;
  activeCheckIns?: ActiveCheckIn[];
  showActivity?: boolean;
  routes?: RouteInfo[];
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
  bikeParks = [],
  bikeLanes = [],
  showBikeParks = false,
  showBikeLanes = false,
  selectedBikeLanes = [],
  mapStyle = "standard",
  onMapReady,
  activeCheckIns = [],
  showActivity = false,
  routes = [],
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LMap | null>(null);
  const tileLayerRef = useRef<LTileLayer | null>(null);
  const busMarkersMapRef = useRef<Map<string, Marker>>(new Map());
  const stopMarkersRef = useRef<Marker[]>([]);
  const bikeParkMarkersRef = useRef<Marker[]>([]);
  const bikeLaneLayersRef = useRef<Polyline[]>([]);
  const mapBoundsRef = useRef<LatLngBounds | null>(null);
  const locationMarkerRef = useRef<Marker | null>(null);
  const highlightedMarkerRef = useRef<Marker | null>(null);
  const routeLayersRef = useRef<Polyline[]>([]);
  const animFramesRef = useRef<Map<string, number>>(new Map());
  const busSegmentRef = useRef<Map<string, { pIdx: number; sIdx: number }>>(new Map());
  const prevRiderCountsRef = useRef<Map<string, number>>(new Map());
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

  // Build a lookup: mode:targetId → rider count from active check-ins
  // Supports both individual bus IDs (FIWARE entity IDs like "urn:ngsi-ld:Vehicle:1234")
  // and legacy route-based targetIds (like "205") for backward compatibility
  const checkInCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ci of activeCheckIns) {
      if (ci.targetId) {
        const key = `${ci.mode}:${ci.targetId}`;
        counts.set(key, (counts.get(key) || 0) + ci.count);
      }
    }
    return counts;
  }, [activeCheckIns]);

  // Set of stop gtfsIds with active check-ins — used to show stops even when showStops is off
  // Only METRO check-ins use stop gtfsIds as targetIds; BUS check-ins now use
  // individual FIWARE bus entity IDs, so they won't match stop gtfsIds.
  const activeStopIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ci of activeCheckIns) {
      if (ci.targetId && ci.mode === "METRO") {
        ids.add(ci.targetId);
      }
    }
    return ids;
  }, [activeCheckIns]);

  useEffect(() => {
    if (mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      // Priority: userLocation > saved position > default Porto center
      const savedPos = storage.get<{ lat: number; lon: number; zoom: number }>("mapPosition");
      const center =
        userLocation ||
        (savedPos ? ([savedPos.lat, savedPos.lon] as [number, number]) : [41.1579, -8.6291]);
      const zoom = userLocation ? 15 : savedPos ? savedPos.zoom : 13;

      const map = L.map(mapContainerRef.current, { maxZoom: 19, zoomControl: false }).setView(
        center as [number, number],
        zoom
      );
      L.control.zoom({ position: "bottomleft" }).addTo(map);
      mapInstanceRef.current = map;

      // Persist map position on move (debounced)
      let saveTimeout: ReturnType<typeof setTimeout>;
      map.on("moveend", () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          const c = map.getCenter();
          storage.set("mapPosition", { lat: c.lat, lon: c.lng, zoom: map.getZoom() }, 1);
        }, 500);
      });

      const tileConfigs = {
        standard: {
          url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        },
        satellite: {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution:
            '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Sources: Esri, Maxar, Earthstar Geographics',
          maxZoom: 19,
        },
        terrain: {
          url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
          attribution:
            '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
          maxZoom: 17,
        },
      };
      const tile = tileConfigs[mapStyle as keyof typeof tileConfigs] ?? tileConfigs.standard;
      tileLayerRef.current = L.tileLayer(tile.url, {
        attribution: tile.attribution,
        maxZoom: tile.maxZoom,
        keepBuffer: 6,
        updateWhenIdle: false,
        updateWhenZooming: false,
      }).addTo(map);

      setIsMapReady(true);
      onMapReady?.(map);
      logger.log("Map initialized and ready");

      // Inject rider badge styles
      if (!document.getElementById("rider-badge-styles")) {
        const style = document.createElement("style");
        style.id = "rider-badge-styles";
        style.textContent = `
          .rider-badge {
            transition: transform 0.2s ease;
          }
          .rider-badge-pop {
            animation: rider-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 1;
          }
          @keyframes rider-pop {
            0% { transform: scale(0); opacity: 0; }
            60% { transform: scale(1.3); }
            100% { transform: scale(1); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }

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
          return;
        }
        const bikeParkTarget = (e.target as HTMLElement).closest("[data-rate-bike-park]");
        if (bikeParkTarget) {
          const parkId = bikeParkTarget.getAttribute("data-rate-bike-park");
          const parkName = bikeParkTarget.getAttribute("data-park-name");
          if (parkId) {
            window.dispatchEvent(
              new CustomEvent("open-bike-park-feedback", {
                detail: { parkId, parkName },
              })
            );
          }
          return;
        }
        const bikeLaneTarget = (e.target as HTMLElement).closest("[data-rate-bike-lane]");
        if (bikeLaneTarget) {
          const laneId = bikeLaneTarget.getAttribute("data-rate-bike-lane");
          const laneName = bikeLaneTarget.getAttribute("data-lane-name");
          if (laneId) {
            window.dispatchEvent(
              new CustomEvent("open-bike-lane-feedback", {
                detail: { laneId, laneName },
              })
            );
          }
        }
        // (Check-in buttons removed — check-in is FAB-only for reliable GPS proximity)
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Swap tile layer when mapStyle changes
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;

    import("leaflet").then((L) => {
      if (tileLayerRef.current) {
        tileLayerRef.current.remove();
      }

      const tileConfigs = {
        standard: {
          url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        },
        satellite: {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution:
            '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Sources: Esri, Maxar, Earthstar Geographics',
          maxZoom: 19,
        },
        terrain: {
          url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
          attribution:
            '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
          maxZoom: 17,
        },
      };
      const tile = tileConfigs[mapStyle as keyof typeof tileConfigs] ?? tileConfigs.standard;
      tileLayerRef.current = L.tileLayer(tile.url, {
        attribution: tile.attribution,
        maxZoom: tile.maxZoom,
        keepBuffer: 6,
        updateWhenIdle: false,
        updateWhenZooming: false,
      }).addTo(mapInstanceRef.current!);

      mapInstanceRef.current!.setMaxZoom(tile.maxZoom);
    });
  }, [mapStyle, isMapReady]);

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
      const currentBusIds = new Set(buses.map((b) => b.id));

      // Remove stale markers
      busMarkersMapRef.current.forEach((marker, id) => {
        if (!currentBusIds.has(id)) {
          const af = animFramesRef.current.get(id);
          if (af) {
            cancelAnimationFrame(af);
            animFramesRef.current.delete(id);
          }
          busSegmentRef.current.delete(id);
          marker.remove();
          busMarkersMapRef.current.delete(id);
        }
      });

      buses.forEach((bus) => {
        const destinationText = (bus.routeLongName || "Destino desconhecido")
          .replace(/^\*+/, "")
          .trim();
        const truncatedDestination =
          destinationText.length > 20 ? destinationText.substring(0, 17) + "..." : destinationText;
        const routeColor = getRouteColor(bus.routeShortName, selectedRoutes, routes);
        // Look up rider count by individual bus ID (FIWARE entity ID)
        const riderCount = checkInCounts.get(`BUS:${bus.id}`) || 0;
        const prevCount = prevRiderCountsRef.current.get(bus.id) || 0;
        const isNew = riderCount > 0 && riderCount > prevCount;
        const animClass = isNew ? "rider-badge rider-badge-pop" : "rider-badge";
        const riderBadge =
          riderCount > 0
            ? `<div class="${animClass}" style="position:absolute;top:-8px;right:-8px;min-width:18px;height:18px;background:#10b981;border:2px solid white;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;font-family:system-ui,sans-serif;padding:0 3px;box-shadow:0 1px 3px rgba(0,0,0,0.3);">${riderCount}</div>`
            : "";

        // Full route span from OTP (e.g. "Bolhão - Codiceira")
        const routeInfo = routes.find((r) => r.shortName === bus.routeShortName);
        const fullRouteName = routeInfo
          ? toTitleCase(routeInfo.longName.replace(/([^\s])-([^\s])/g, "$1 - $2"))
          : null;

        const iconHtml = `
          <div style="display:flex;align-items:center;gap:4px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
            <div style="position:relative;min-width:44px;height:32px;background:${routeColor};border:2px solid white;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;color:white;font-family:system-ui,sans-serif;cursor:pointer;padding:0 6px;box-shadow:0 1px 3px rgba(0,0,0,0.3);">
              ${escapeHtml(bus.routeShortName)}${riderBadge}
            </div>
            <div style="background:rgba(255,255,255,0.98);border:1px solid #cbd5e1;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:600;color:#1e40af;font-family:system-ui,sans-serif;white-space:nowrap;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.2);max-width:150px;overflow:hidden;text-overflow:ellipsis;">
              ${escapeHtml(truncatedDestination)}
            </div>
          </div>`;

        const popupHtml = `
          <div class="bus-popup text-sm" style="min-width:240px;font-family:system-ui,sans-serif;">
            <a href="/reviews/line?id=${encodeURIComponent(bus.routeShortName)}" class="bus-popup-title" style="color:inherit;text-decoration:none;display:block;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">Linha ${escapeHtml(bus.routeShortName)}</a>
            ${fullRouteName ? `<div class="bus-popup-info" style="color:#64748b;font-size:11px;margin-bottom:2px;">${escapeHtml(fullRouteName)}</div>` : ""}
            <div class="bus-popup-destination">→ ${escapeHtml(destinationText)}</div>
            <div class="bus-popup-info"><strong>Velocidade:</strong> ${bus.speed > 0 ? Math.round(bus.speed) + " km/h" : "Parado"}</div>
            ${bus.vehicleNumber ? `<div class="bus-popup-info"><strong>Veículo nº</strong> <a href="/reviews/vehicle?id=${encodeURIComponent(bus.vehicleNumber)}" style="color:#4f46e5;text-decoration:none;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(bus.vehicleNumber)}</a></div>` : ""}
            <div class="bus-popup-footer">Atualizado: ${new Date(bus.lastUpdated).toLocaleTimeString("pt-PT")}</div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              <button data-rate-line="${escapeHtml(bus.routeShortName)}" class="bus-popup-rate-btn" style="flex:1;padding:6px 12px;background:#eab308;color:white;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">★ Linha ${escapeHtml(bus.routeShortName)}</button>
              ${bus.vehicleNumber ? `<button data-rate-vehicle="${escapeHtml(bus.vehicleNumber)}" data-vehicle-line="${escapeHtml(bus.routeShortName)}" class="bus-popup-rate-btn" style="flex:1;padding:6px 12px;background:#6366f1;color:white;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">★ Bus ${escapeHtml(bus.vehicleNumber)}</button>` : ""}
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
          const target = snapToRoute(
            bus.lat,
            bus.lon,
            bus.routeShortName,
            routePatternsMap,
            bus.id,
            busSegmentRef.current
          );
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
          const jumpM = Math.sqrt(
            (dLat * 111_320) ** 2 + (dLon * 111_320 * Math.cos((cur.lat * Math.PI) / 180)) ** 2
          );
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
          const snapped = snapToRoute(
            bus.lat,
            bus.lon,
            bus.routeShortName,
            routePatternsMap,
            bus.id,
            busSegmentRef.current
          );
          const marker = L.marker(snapped, {
            icon: busIcon,
            title: `Linha ${bus.routeShortName} → ${destinationText}`,
          })
            .addTo(mapInstanceRef.current!)
            .bindPopup(popupHtml);
          busMarkersMapRef.current.set(bus.id, marker);
        }
      });

      // Snapshot current rider counts so pop animation only fires once per increase
      const next = new Map<string, number>();
      buses.forEach((b) => {
        const c = checkInCounts.get(`BUS:${b.id}`) || 0;
        if (c > 0) next.set(b.id, c);
      });
      prevRiderCountsRef.current = next;
    });
  }, [buses, isMapReady, selectedRoutes, routePatterns, checkInCounts, routes]);

  // Viewport-based stop rendering
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady) return;

    const map = mapInstanceRef.current;

    const renderVisibleStops = () => {
      import("leaflet").then((L) => {
        stopMarkersRef.current.forEach((marker) => marker.remove());
        stopMarkersRef.current = [];

        if (stops.length === 0) return;
        // If stops are hidden AND activity is off (or no active stops), nothing to render
        if (!showStops && (!showActivity || activeStopIds.size === 0)) return;

        const zoom = map.getZoom();
        const bounds = map.getBounds();
        mapBoundsRef.current = bounds;

        stops
          .filter((stop) => {
            if (!bounds.contains([stop.lat, stop.lon])) return false;
            const hasActivity = activeStopIds.has(stop.gtfsId);
            // If stops are hidden, only show stops with active check-ins
            if (!showStops) return hasActivity && showActivity;
            // Metro stops visible from zoom 12+, bus stops from zoom 15+
            // But always show stops with active check-ins regardless of zoom
            if (hasActivity && showActivity) return true;
            const isMetro = stop.vehicleMode === "SUBWAY";
            return isMetro ? zoom >= 12 : zoom >= 15;
          })
          .forEach((stop) => {
            const isMetro = stop.vehicleMode === "SUBWAY";
            // Count check-ins at this stop across BUS and METRO modes (using gtfsId for unique matching)
            const stopRiders =
              (checkInCounts.get(`BUS:${stop.gtfsId}`) || 0) +
              (checkInCounts.get(`METRO:${stop.gtfsId}`) || 0);
            const riderBadge =
              stopRiders > 0
                ? `<div style="position:absolute;top:-8px;right:-8px;min-width:18px;height:18px;background:#10b981;border:2px solid white;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:white;font-family:system-ui,sans-serif;padding:0 3px;box-shadow:0 1px 3px rgba(0,0,0,0.3);">${stopRiders}</div>`
                : "";
            const stopIconHtml = isMetro
              ? `<div style="position:relative;display:inline-block;"><svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 22 22" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));cursor:pointer;">
                  <circle cx="11" cy="11" r="10" fill="#2563eb" stroke="white" stroke-width="1.5"/>
                  <text x="11" y="15.5" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="white">M</text>
                </svg>${riderBadge}</div>`
              : `<div style="position:relative;display:inline-block;"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 20 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));cursor:pointer;">
                  <rect x="9" y="8" width="2" height="16" rx="1" fill="#5f6368"/>
                  <rect x="2" y="0" width="16" height="12" rx="2.5" fill="#0d9488" stroke="white" stroke-width="1"/>
                  <path d="M6.5 3.5h7a1 1 0 011 1v2.5a1 1 0 01-1 1h-7a1 1 0 01-1-1V4.5a1 1 0 011-1z" fill="white" opacity="0.9"/>
                  <rect x="6" y="8.5" width="3" height="1.5" rx="0.5" fill="white" opacity="0.7"/>
                  <rect x="11" y="8.5" width="3" height="1.5" rx="0.5" fill="white" opacity="0.7"/>
                </svg>${riderBadge}</div>`;
            const stopIcon = L.divIcon({
              html: stopIconHtml,
              className: "custom-stop-marker",
              iconSize: isMetro ? [30, 30] : [28, 34],
              iconAnchor: isMetro ? [15, 15] : [14, 34],
              popupAnchor: isMetro ? [0, -15] : [0, -28],
            });

            const popupContent = `
                <div class="stop-popup text-sm" style="min-width:220px;max-width:280px;font-family:system-ui,sans-serif;">
                  <div class="stop-popup-title">${escapeHtml(stop.name)}</div>
                  <div id="departures-${stop.gtfsId.replace(/[^a-zA-Z0-9]/g, "_")}" style="margin:8px 0;">
                    <div style="color:#9ca3af;font-size:12px;">A carregar próximos...</div>
                  </div>
                  <a href="/station?gtfsId=${encodeURIComponent(stop.gtfsId)}" class="stop-popup-link">Ver todos os horários →</a>
                </div>
              `;

            const marker = L.marker([stop.lat, stop.lon], { icon: stopIcon })
              .addTo(map)
              .bindPopup(popupContent);

            marker.on("popupopen", () => {
              const containerId = `departures-${stop.gtfsId.replace(/[^a-zA-Z0-9]/g, "_")}`;
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
                    .map(
                      (d: {
                        serviceDay: number;
                        realtimeDeparture: number;
                        headsign?: string;
                        realtime?: boolean;
                        trip: { gtfsId: string; route: { shortName: string } };
                      }) => ({
                        ...d,
                        departureMs: (d.serviceDay + d.realtimeDeparture) * 1000,
                      })
                    )
                    .filter((d: { departureMs: number }) => d.departureMs > now)
                    .slice(0, 4);

                  if (upcoming.length === 0) {
                    el.innerHTML =
                      '<div style="color:#9ca3af;font-size:12px;">Sem partidas próximas</div>';
                    return;
                  }

                  el.innerHTML = upcoming
                    .map(
                      (d: {
                        departureMs: number;
                        realtime?: boolean;
                        headsign?: string;
                        trip: { gtfsId: string; route: { shortName: string } };
                      }) => {
                        const mins = Math.floor((d.departureMs - now) / 60000);
                        const timeStr = mins <= 0 ? "&lt;1 min" : `${mins} min`;
                        const color = mins <= 2 ? "#ef4444" : mins <= 5 ? "#f59e0b" : "#3b82f6";
                        const rt = d.realtime
                          ? '<span style="display:inline-block;width:6px;height:6px;background:#22c55e;border-radius:50%;margin-right:4px;vertical-align:middle;animation:rtpulse 1.5s ease-in-out infinite;"></span>'
                          : "";
                        const tripIdPart = d.trip.gtfsId.replace(/^2:/, "");
                        return `<div data-trip-id="${escapeHtml(tripIdPart)}" data-route="${escapeHtml(d.trip.route.shortName)}" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;cursor:pointer;border-radius:4px;padding-left:4px;padding-right:4px;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
                      <span><strong>${escapeHtml(d.trip.route.shortName)}</strong> <span style="color:#6b7280;">${escapeHtml(d.headsign || "")}</span></span>
                      <span style="display:inline-flex;align-items:center;color:${color};font-weight:600;white-space:nowrap;">${rt}${timeStr}</span>
                    </div>`;
                      }
                    )
                    .join("");

                  // Attach click handlers to snap to bus on map
                  el.querySelectorAll("[data-trip-id]").forEach((row) => {
                    row.addEventListener("click", () => {
                      const tripId = row.getAttribute("data-trip-id");
                      const route = row.getAttribute("data-route");
                      // Enable route filter if not already selected
                      if (
                        route &&
                        selectedRoutes.length > 0 &&
                        !selectedRoutes.includes(route) &&
                        onSelectRoute
                      ) {
                        onSelectRoute(route);
                      }
                      // Match by trip ID first (exact), fall back to route name
                      // Use allBuses (unfiltered) since we just enabled the route
                      const matchingBus =
                        allBuses.find((b) => b.tripId === tripId) ||
                        allBuses.find((b) => b.routeShortName === route);
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
                  el.innerHTML =
                    '<div style="color:#ef4444;font-size:12px;">Erro ao carregar</div>';
                });
            });
            stopMarkersRef.current.push(marker);
          });
      });
    };

    renderVisibleStops();
    map.on("moveend", renderVisibleStops);
    return () => {
      map.off("moveend", renderVisibleStops);
    };
  }, [stops, showStops, isMapReady, showActivity, activeStopIds, checkInCounts]);

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
        .bindPopup(
          '<div class="text-sm"><div class="font-bold text-blue-600">Your Location</div></div>'
        );

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

      const isMetro = highlightedStop.vehicleMode === "SUBWAY";
      const highlightedIcon = L.divIcon({
        html: isMetro
          ? `<div style="position:relative;width:34px;height:34px;">
              <div style="position:absolute;width:50px;height:50px;background:rgba(37,99,235,0.25);border-radius:50%;animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;top:50%;left:50%;transform:translate(-50%,-50%);"></div>
              <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 22 22" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));position:relative;z-index:1;">
                <circle cx="11" cy="11" r="10" fill="#2563eb" stroke="white" stroke-width="1.5"/>
                <text x="11" y="15.5" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="white">M</text>
              </svg>
            </div>
            <style>@keyframes pulse{0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1);}50%{opacity:0;transform:translate(-50%,-50%) scale(1.5);}}</style>`
          : `<div style="position:relative;width:30px;height:36px;">
              <div style="position:absolute;width:46px;height:46px;background:rgba(13,148,136,0.25);border-radius:50%;animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;top:50%;left:50%;transform:translate(-50%,-50%);"></div>
              <svg xmlns="http://www.w3.org/2000/svg" width="30" height="36" viewBox="0 0 20 24" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));position:relative;z-index:1;">
                <rect x="9" y="8" width="2" height="16" rx="1" fill="#5f6368"/>
                <rect x="2" y="0" width="16" height="12" rx="2.5" fill="#0d9488" stroke="white" stroke-width="1.5"/>
                <path d="M6.5 3.5h7a1 1 0 011 1v2.5a1 1 0 01-1 1h-7a1 1 0 01-1-1V4.5a1 1 0 011-1z" fill="white" opacity="0.9"/>
                <rect x="6" y="8.5" width="3" height="1.5" rx="0.5" fill="white" opacity="0.7"/>
                <rect x="11" y="8.5" width="3" height="1.5" rx="0.5" fill="white" opacity="0.7"/>
              </svg>
            </div>
            <style>@keyframes pulse{0%,100%{opacity:1;transform:translate(-50%,-50%) scale(1);}50%{opacity:0;transform:translate(-50%,-50%) scale(1.5);}}</style>`,
        className: "custom-highlighted-stop-marker",
        iconSize: isMetro ? [50, 50] : [46, 46],
        iconAnchor: isMetro ? [25, 25] : [23, 28],
        popupAnchor: isMetro ? [0, -20] : [0, -24],
      });

      highlightedMarkerRef.current = L.marker([highlightedStop.lat, highlightedStop.lon], {
        icon: highlightedIcon,
        zIndexOffset: 1000,
      })
        .addTo(mapInstanceRef.current!)
        .bindPopup(
          `
          <div class="stop-popup text-sm" style="min-width:200px;font-family:system-ui,sans-serif;">
            <div class="stop-popup-title">${escapeHtml(highlightedStop.name)}</div>
            ${highlightedStop.code ? `<div class="stop-popup-code"><strong>Código:</strong> ${escapeHtml(highlightedStop.code)}</div>` : ""}
            <a href="/station?gtfsId=${encodeURIComponent(highlightedStop.gtfsId)}" class="stop-popup-link" target="_blank">Ver Horários →</a>
          </div>
        `
        )
        .openPopup();

      mapInstanceRef.current!.flyTo([highlightedStop.lat, highlightedStop.lon], 17, {
        duration: 1.5,
      });
    });
  }, [highlightedStationId, stops, isMapReady]);

  // Route polylines
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady || !routePatterns || routePatterns.length === 0)
      return;

    import("leaflet").then((L) => {
      routeLayersRef.current.forEach((layer) => layer.remove());
      routeLayersRef.current = [];

      if (!showRoutes || selectedRoutes.length === 0) return;

      const routeColorMap = new Map<string, string>();
      selectedRoutes.forEach((route, index) => {
        const info = routes?.find((r) => r.shortName === route);
        routeColorMap.set(
          route,
          info?.color ? `#${info.color}` : (ROUTE_COLORS[index % ROUTE_COLORS.length] ?? "#2563eb")
        );
      });

      routePatterns
        .filter((pattern) => selectedRoutes.includes(pattern.routeShortName))
        .forEach((pattern) => {
          const color = routeColorMap.get(pattern.routeShortName) || "#3b82f6";
          const latLngs = pattern.geometry.coordinates.map(
            (coord) => [coord[1], coord[0]] as [number, number]
          );

          const polyline = L.polyline(latLngs, {
            color,
            weight: 4,
            opacity: 0.7,
            smoothFactor: 1,
          }).addTo(mapInstanceRef.current!).bindPopup(`
              <div class="route-popup text-sm" style="min-width:220px;font-family:system-ui,sans-serif;">
                <a href="/reviews/line?id=${encodeURIComponent(pattern.routeShortName)}" style="font-weight:700;font-size:15px;color:${color};text-decoration:none;display:block;margin-bottom:2px;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">Linha ${escapeHtml(pattern.routeShortName)}</a>
                <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">→ ${escapeHtml(pattern.headsign)}</div>
                <div style="font-size:12px;color:#9ca3af;margin-bottom:10px;">${escapeHtml(pattern.routeLongName)}</div>
                <button data-rate-line="${escapeHtml(pattern.routeShortName)}" class="bus-popup-rate-btn" style="width:100%;padding:8px 12px;background:${color};color:white;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
                  ★ Avaliar Linha ${escapeHtml(pattern.routeShortName)}
                </button>
              </div>
            `);

          polyline.bringToBack();
          routeLayersRef.current.push(polyline);
        });

      logger.log(`Rendered ${routeLayersRef.current.length} route polylines`);
    });
  }, [routePatterns, selectedRoutes, showRoutes, isMapReady]);

  // Bike parks markers
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady || bikeParks.length === 0) return;

    import("leaflet").then((L) => {
      // Clear existing bike park markers
      bikeParkMarkersRef.current.forEach((marker) => marker.remove());
      bikeParkMarkersRef.current = [];

      if (
        !showBikeParks &&
        (!showActivity || !bikeParks.some((p) => (checkInCounts.get(`BIKE:${p.id}`) || 0) > 0))
      )
        return;

      bikeParks.forEach((park) => {
        const parkRiders = checkInCounts.get(`BIKE:${park.id}`) || 0;
        // If bike parks are hidden, only show parks with active check-ins
        if (!showBikeParks && parkRiders === 0) return;
        const occupancyPercent =
          park.capacity > 0 ? Math.round((park.occupied / park.capacity) * 100) : 0;
        const occupancyColor =
          occupancyPercent >= 90 ? "#ef4444" : occupancyPercent >= 70 ? "#f59e0b" : "#22c55e";
        const availabilityText = park.available > 0 ? `${park.available} vagas` : "Lotado";
        const parkRiderBadge =
          parkRiders > 0
            ? `<div style="position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;background:#3b82f6;border:2px solid white;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:white;font-family:system-ui,sans-serif;padding:0 2px;box-shadow:0 1px 3px rgba(0,0,0,0.3);">${parkRiders}</div>`
            : "";

        const iconHtml = `
          <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:#10b981;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);cursor:pointer;position:relative;">
            <span style="font-size:18px;">🚲</span>
            <div style="position:absolute;bottom:-2px;right:-2px;width:14px;height:14px;background:${occupancyColor};border:2px solid white;border-radius:50%;"></div>
            ${parkRiderBadge}
          </div>`;

        const popupHtml = `
          <div class="bike-park-popup text-sm" style="min-width:220px;font-family:system-ui,sans-serif;">
            <a href="/reviews/bike-park?id=${encodeURIComponent(park.name)}" style="font-weight:700;font-size:14px;color:#059669;text-decoration:none;display:block;margin-bottom:4px;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(park.name)}</a>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
                <div style="width:${occupancyPercent}%;height:100%;background:${occupancyColor};transition:width 0.3s;"></div>
              </div>
              <span style="font-size:12px;color:#6b7280;white-space:nowrap;">${occupancyPercent}%</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;margin-bottom:12px;">
              <div style="background:#f3f4f6;padding:6px;border-radius:4px;">
                <div style="font-size:16px;font-weight:600;color:#374151;">${park.capacity}</div>
                <div style="font-size:10px;color:#6b7280;">Total</div>
              </div>
              <div style="background:#f3f4f6;padding:6px;border-radius:4px;">
                <div style="font-size:16px;font-weight:600;color:#ef4444;">${park.occupied}</div>
                <div style="font-size:10px;color:#6b7280;">Ocupado</div>
              </div>
              <div style="background:#f3f4f6;padding:6px;border-radius:4px;">
                <div style="font-size:16px;font-weight:600;color:#22c55e;">${park.available}</div>
                <div style="font-size:10px;color:#6b7280;">Livre</div>
              </div>
            </div>
            <div style="font-size:11px;color:#9ca3af;text-align:center;margin-bottom:8px;">
              Atualizado: ${new Date(park.lastUpdated).toLocaleTimeString("pt-PT")}
            </div>
            <button data-rate-bike-park="${escapeHtml(park.id)}" data-park-name="${escapeHtml(park.name)}" class="bike-park-rate-btn" style="width:100%;padding:8px 12px;background:#10b981;color:white;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
              ★ Avaliar este parque
            </button>
          </div>`;

        const parkIcon = L.divIcon({
          html: iconHtml,
          className: "custom-bike-park-marker",
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -18],
        });

        const marker = L.marker([park.lat, park.lon], {
          icon: parkIcon,
          title: `${park.name} - ${availabilityText}`,
        })
          .addTo(mapInstanceRef.current!)
          .bindPopup(popupHtml);

        bikeParkMarkersRef.current.push(marker);
      });

      logger.log(`Rendered ${bikeParkMarkersRef.current.length} bike park markers`);
    });
  }, [bikeParks, showBikeParks, isMapReady, checkInCounts, showActivity]);

  // Bike lanes polylines
  useEffect(() => {
    if (!mapInstanceRef.current || !isMapReady || bikeLanes.length === 0) return;

    import("leaflet").then((L) => {
      // Guard: map may have been destroyed while awaiting the dynamic import
      if (!mapInstanceRef.current) return;

      // Clear existing bike lane layers
      bikeLaneLayersRef.current.forEach((layer) => {
        try {
          layer.remove();
        } catch {
          /* already removed */
        }
      });
      bikeLaneLayersRef.current = [];

      if (
        !showBikeLanes &&
        (!showActivity || !bikeLanes.some((l) => (checkInCounts.get(`BIKE:${l.name}`) || 0) > 0))
      )
        return;

      // Filter lanes if specific ones are selected (only when showBikeLanes is on)
      const lanesToShow =
        showBikeLanes && selectedBikeLanes.length > 0
          ? bikeLanes.filter(
              (lane) =>
                selectedBikeLanes.includes(lane.id) ||
                (showActivity && (checkInCounts.get(`BIKE:${lane.name}`) || 0) > 0)
            )
          : showBikeLanes
            ? bikeLanes
            : bikeLanes.filter((lane) => (checkInCounts.get(`BIKE:${lane.name}`) || 0) > 0);

      lanesToShow.forEach((lane) => {
        if (!mapInstanceRef.current) return;
        const isPlanned = lane.status === "planned";

        const typeColors: Record<string, string> = {
          ciclovia: "#10b981",
          ciclorrota: "#3b82f6",
          ciclovia_em_via_pedonal: "#8b5cf6",
          ciclovia_marginal_rio: "#06b6d4",
        };

        const baseColor = typeColors[lane.type] || "#10b981";
        const color = isPlanned ? "#9ca3af" : baseColor;
        const laneRiders = checkInCounts.get(`BIKE:${lane.name}`) || 0;

        // Compute a midpoint from the lane's first segment for fallback check-in location
        let _midLat = "";
        let _midLon = "";
        if (Array.isArray(lane.segments) && lane.segments.length > 0) {
          const seg = lane.segments[0];
          if (Array.isArray(seg) && seg.length >= 2) {
            const midIdx = Math.floor(seg.length / 2);
            const coord = seg[midIdx];
            if (Array.isArray(coord) && coord.length >= 2) {
              const _midLat = String(Number(coord[1]));
              const _midLon = String(Number(coord[0]));
            }
          }
        }

        const popupContent = `
          <div class="bike-lane-popup text-sm" style="min-width:200px;font-family:system-ui,sans-serif;">
            <a href="/reviews/bike-lane?id=${encodeURIComponent(lane.name)}" style="font-weight:700;font-size:14px;color:${color};text-decoration:none;display:block;margin-bottom:4px;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(lane.name)}</a>
            ${isPlanned ? '<div style="font-size:11px;color:#f59e0b;font-weight:600;margin-bottom:4px;">⚠ Planeada (ainda não construída)</div>' : ""}
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">
              Tipo: ${lane.type === "ciclovia" ? "Ciclovia" : lane.type === "ciclorrota" ? "Ciclorrota" : lane.type === "ciclovia_em_via_pedonal" ? "Via Pedonal" : lane.type === "ciclovia_marginal_rio" ? "Marginal Rio" : lane.type}
            </div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">
              Comprimento: ${(lane.length / 1000).toFixed(2)} km
            </div>
            ${laneRiders > 0 ? `<div style="font-size:12px;color:#10b981;font-weight:600;margin-bottom:8px;">🚲 ${laneRiders} ciclista${laneRiders > 1 ? "s" : ""} agora</div>` : ""}
            <button data-rate-bike-lane="${escapeHtml(lane.id)}" data-lane-name="${escapeHtml(lane.name)}" class="bike-lane-rate-btn" style="width:100%;padding:8px 12px;background:${color};color:white;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
              ★ Avaliar esta ciclovia
            </button>
          </div>
        `;

        // Draw each segment as a separate polyline to avoid straight lines between disconnected parts
        const segments = lane.segments;
        if (!Array.isArray(segments)) return;
        for (const segment of segments) {
          if (!Array.isArray(segment) || segment.length < 2) continue;
          const latLngs: [number, number][] = [];
          for (const coord of segment) {
            if (!Array.isArray(coord) || coord.length < 2) continue;
            const lon = Number(coord[0]);
            const lat = Number(coord[1]);
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
            latLngs.push([lat, lon]);
          }
          if (latLngs.length < 2 || !mapInstanceRef.current) continue;

          try {
            const polyline = L.polyline(latLngs, {
              color: laneRiders > 0 ? "#10b981" : color,
              weight: isPlanned ? 3 : laneRiders > 0 ? 7 : 5,
              opacity: isPlanned ? 0.5 : laneRiders > 0 ? 1 : 0.8,
              smoothFactor: 1,
              dashArray: isPlanned ? "8, 8" : lane.type === "ciclorrota" ? "10, 10" : undefined,
            })
              .addTo(mapInstanceRef.current)
              .bindPopup(popupContent);

            polyline.bringToBack();
            bikeLaneLayersRef.current.push(polyline);
          } catch (err) {
            logger.log(`Failed to render segment for lane ${lane.name}: ${err}`);
          }
        }
      });

      logger.log(`Rendered ${bikeLaneLayersRef.current.length} bike lane polylines`);
    });
  }, [bikeLanes, showBikeLanes, selectedBikeLanes, isMapReady, checkInCounts, showActivity]);

  return <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />;
}
