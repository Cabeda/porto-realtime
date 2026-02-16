"use client";

import useSWR from "swr";
import type {
  FeedbackSummaryResponse,
  FeedbackListResponse,
  FeedbackType,
} from "@/lib/types";

const jsonFetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Fetch batch feedback summaries for multiple targets.
 * Returns a map of targetId → { avg, count }.
 */
export function useFeedbackSummaries(
  type: FeedbackType,
  targetIds: string[]
) {
  const ids = targetIds.filter(Boolean).join(",");
  const key = ids.length > 0 ? `/api/feedback/summary?type=${type}&targetIds=${encodeURIComponent(ids)}` : null;

  return useSWR<FeedbackSummaryResponse>(key, jsonFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
    refreshInterval: 120000, // refresh every 2 min
  });
}

/**
 * Fetch detailed feedback list for a single target (with pagination).
 * Includes the current user's feedback via session cookie.
 */
export function useFeedbackList(
  type: FeedbackType,
  targetId: string | null,
  page = 0,
  limit = 10,
  sort: "recent" | "helpful" = "recent"
) {
  const key = targetId
    ? `/api/feedback?type=${type}&targetId=${encodeURIComponent(targetId)}&page=${page}&limit=${limit}${sort === "helpful" ? "&sort=helpful" : ""}`
    : null;

  return useSWR<FeedbackListResponse>(key, jsonFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}
