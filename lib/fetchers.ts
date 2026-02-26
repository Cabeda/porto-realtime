import { storage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import type {
  BusesResponse,
  StopsResponse,
  RoutesResponse,
  BikeParksResponse,
  BikeLanesResponse,
  RoutePatternsResponse,
} from "@/lib/types";

// Fetcher with localStorage fallback for buses (short cache for instant load)
export const busesFetcher = async (url: string): Promise<BusesResponse> => {
  const cached = storage.get<BusesResponse>("cachedBuses");

  if (cached) {
    logger.log("Loading buses from localStorage cache");
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch buses");
        return res.json();
      })
      .then((freshData) => {
        storage.set("cachedBuses", freshData, 0.033);
        logger.log("Updated buses cache with fresh data");
      })
      .catch((err) => {
        logger.error("Failed to update buses cache:", err);
      });
    return cached;
  }

  logger.log("Fetching buses from network (first time)");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch buses");
  }
  const data = await response.json();
  storage.set("cachedBuses", data, 0.033);
  return data;
};

// Fetcher with localStorage fallback for stations (they change infrequently)
export const stationsFetcher = async (url: string): Promise<StopsResponse> => {
  const cached = storage.get<StopsResponse>("cachedStations");

  if (cached) {
    logger.log("Loading stations from localStorage cache");
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch stations");
        return res.json();
      })
      .then((freshData) => {
        storage.set("cachedStations", freshData, 7);
        logger.log("Updated stations cache with fresh data");
      })
      .catch((err) => {
        logger.error("Failed to update stations cache:", err);
      });
    return cached;
  }

  logger.log("Fetching stations from network (first time)");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch stations");
  }
  const data = await response.json();
  storage.set("cachedStations", data, 7);
  return data;
};

// Fetcher with localStorage fallback for routes (cached 7 days)
export const routesFetcher = async (url: string): Promise<RoutesResponse> => {
  const cached = storage.get<RoutesResponse>("cachedRoutes");

  if (cached) {
    logger.log("Loading routes from localStorage cache");
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch routes");
        return res.json();
      })
      .then((freshData) => {
        storage.set("cachedRoutes", freshData, 7);
        logger.log("Updated routes cache with fresh data");
      })
      .catch((err) => {
        logger.error("Failed to update routes cache:", err);
      });
    return cached;
  }

  logger.log("Fetching routes from network (first time)");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch routes");
  }
  const data = await response.json();
  storage.set("cachedRoutes", data, 7);
  return data;
};

// Fetcher with localStorage fallback for route shapes (cached 7 days)
export const routeShapesFetcher = async (url: string): Promise<RoutePatternsResponse> => {
  const cached = storage.get<RoutePatternsResponse>("cachedRouteShapes");

  if (cached) {
    logger.log("Loading route shapes from localStorage cache");
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch route shapes");
        return res.json();
      })
      .then((freshData) => {
        storage.set("cachedRouteShapes", freshData, 7);
        logger.log("Updated route shapes cache with fresh data");
      })
      .catch((err) => {
        logger.error("Failed to update route shapes cache:", err);
      });
    return cached;
  }

  logger.log("Fetching route shapes from network (first time)");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch route shapes");
  }
  const data = await response.json();
  storage.set("cachedRouteShapes", data, 7);
  return data;
};

// Fetcher with localStorage fallback for bike parks (cached 1 hour)
export const bikeParksFetcher = async (url: string): Promise<BikeParksResponse> => {
  const cached = storage.get<BikeParksResponse>("cachedBikeParks");

  if (cached) {
    logger.log("Loading bike parks from localStorage cache");
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bike parks");
        return res.json();
      })
      .then((freshData) => {
        storage.set("cachedBikeParks", freshData, 0.042); // ~1 hour
        logger.log("Updated bike parks cache with fresh data");
      })
      .catch((err) => {
        logger.error("Failed to update bike parks cache:", err);
      });
    return cached;
  }

  logger.log("Fetching bike parks from network (first time)");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch bike parks");
  }
  const data = await response.json();
  storage.set("cachedBikeParks", data, 0.042);
  return data;
};

// Fetcher with localStorage fallback for bike lanes (cached 7 days)
export const bikeLanesFetcher = async (url: string): Promise<BikeLanesResponse> => {
  const cached = storage.get<BikeLanesResponse>("cachedBikeLanes");

  if (cached) {
    logger.log("Loading bike lanes from localStorage cache");
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bike lanes");
        return res.json();
      })
      .then((freshData) => {
        storage.set("cachedBikeLanes", freshData, 7);
        logger.log("Updated bike lanes cache with fresh data");
      })
      .catch((err) => {
        logger.error("Failed to update bike lanes cache:", err);
      });
    return cached;
  }

  logger.log("Fetching bike lanes from network (first time)");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch bike lanes");
  }
  const data = await response.json();
  storage.set("cachedBikeLanes", data, 7);
  return data;
};
