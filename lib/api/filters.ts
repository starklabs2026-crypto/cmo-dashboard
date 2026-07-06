import type { DashboardFilters } from "@/lib/dashboard/queries";

export function filtersFromUrl(url: string): DashboardFilters {
  const searchParams = new URL(url).searchParams;
  const pnl = searchParams.get("pnl");

  return {
    dateFrom: searchParams.get("date_from") ?? undefined,
    dateTo: searchParams.get("date_to") ?? undefined,
    app: searchParams.get("app") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    pnl: pnl === "positive" || pnl === "negative" ? pnl : undefined
  };
}
