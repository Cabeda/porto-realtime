"use client";

import useSWR from "swr";
import { getAnonymousId } from "@/lib/anonymous-id";
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
 * Includes the current user's feedback — session cookie is sent automatically,
 * and x-anonymous-id is sent as a fallback header.
 */
export function useFeedbackList(
  type: FeedbackType,
  targetId: string | null,
  page = 0,
  limit = 10
) {
  const anonId = typeof window !== "undefined" ? getAnonymousId() : null;

  const fetcher = async (url: string): Promise<FeedbackListResponse> => {
    const headers: Record<string, string> = {};
    // Always send anonId as fallback — the server prefers session cookie if present
    if (anonId) headers["x-anonymous-id"] = anonId;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Failed to fetch feedback");
    return res.json();
  };

  const key = targetId
    ? `/api/feedback?type=${type}&targetId=${encodeURIComponent(targetId)}&page=${page}&limit=${limit}`
    : null;

  return useSWR<FeedbackListResponse>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}
