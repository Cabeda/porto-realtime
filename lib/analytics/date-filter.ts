/**
 * Shared helper for parsing date/period params across analytics APIs.
 * Supports: period=today|7d|30d or date=YYYY-MM-DD
 */

export type DateFilter =
  | { mode: "today" }
  | { mode: "period"; days: number; fromDate: Date; period: string }
  | { mode: "date"; date: Date; dateStr: string };

export function parseDateFilter(
  period: string | null,
  dateParam: string | null
): DateFilter {
  const now = new Date();

  // Specific date takes priority
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const todayStr = now.toISOString().slice(0, 10);
    if (dateParam === todayStr) {
      return { mode: "today" };
    }
    return {
      mode: "date",
      date: new Date(dateParam + "T00:00:00Z"),
      dateStr: dateParam,
    };
  }

  const p = period || "today";
  if (p === "today") {
    return { mode: "today" };
  }

  const days = p === "7d" ? 7 : 30;
  const fromDate = new Date(now);
  fromDate.setUTCDate(fromDate.getUTCDate() - days);
  fromDate.setUTCHours(0, 0, 0, 0);

  return { mode: "period", days, fromDate, period: p };
}
