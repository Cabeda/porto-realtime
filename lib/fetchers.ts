import { storage } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { translations } from "@/lib/translations";
import type { BusesResponse, StopsResponse } from "@/lib/types";

// Fetcher with localStorage fallback for buses (short cache for instant load)
export const busesFetcher = async (url: string): Promise<BusesResponse> => {
  const cached = storage.get<BusesResponse>("cachedBuses");

  if (cached) {
    logger.log("Loading buses from localStorage cache");
    fetch(url)
      .then((res) => res.json())
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
        if (!res.ok) throw new Error(translations.stations.errorLoading);
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
    throw new Error(translations.stations.errorLoading);
  }
  const data = await response.json();
  storage.set("cachedStations", data, 7);
  return data;
};

// Simple JSON fetcher
export const fetcher = (url: string) => fetch(url).then((res) => res.json());
