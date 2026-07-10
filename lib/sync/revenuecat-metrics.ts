import { enumerateDates, toIsoDate, type DateRange } from "@/lib/sync/dates";
import { extractRevenueCatMetricValue } from "@/lib/sync/revenuecat-series";

type Fetcher = typeof fetch;

type ResolvedRevenueCatProject = {
  appName: string;
  projectId: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const REVENUECAT_BASE_URL = "https://api.revenuecat.com/v2";
const MAX_REVENUECAT_METRIC_DAYS = 25;
const DEFAULT_REVENUECAT_METRIC_DAYS = 14;

function getInclusiveDayCount(dateFrom: string, dateTo: string): number {
  const startMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const endMs = Date.parse(`${dateTo}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0;
  }

  return Math.floor((endMs - startMs) / DAY_MS) + 1;
}

export function assertRevenueCatMetricDateRange(dateFrom: string, dateTo: string): void {
  if (getInclusiveDayCount(dateFrom, dateTo) > MAX_REVENUECAT_METRIC_DAYS) {
    throw new Error(
      "RevenueCat metrics/revenue backfills must be chunked to at most 25 inclusive days."
    );
  }
}

async function fetchRevenueMetricValue(
  projectId: string,
  apiKey: string,
  date: string,
  fetcher: Fetcher,
  attempt = 0
): Promise<number> {
  const url = new URL(
    `/v2/projects/${encodeURIComponent(projectId)}/metrics/revenue`,
    REVENUECAT_BASE_URL
  );
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("currency", "USD");
  url.searchParams.set("revenue_type", "proceeds");

  const response = await fetcher(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (response.status === 429 && attempt < 3) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "1");
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfterSeconds) * 1000));
    return fetchRevenueMetricValue(projectId, apiKey, date, fetcher, attempt + 1);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RevenueCat ${response.status}: ${text.slice(0, 300)}`);
  }

  return extractRevenueCatMetricValue(await response.json());
}

export async function fetchRevenueMetricSeries(
  projectId: string,
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  fetcher: Fetcher
): Promise<Map<string, number>> {
  assertRevenueCatMetricDateRange(dateFrom, dateTo);

  const series = new Map<string, number>();
  for (const date of enumerateDates(dateFrom, dateTo)) {
    series.set(date, await fetchRevenueMetricValue(projectId, apiKey, date, fetcher));
  }

  return series;
}

export function getDefaultRevenueCatMetricDateRange(now = new Date()): DateRange {
  const dateTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dateFrom = new Date(dateTo);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - (DEFAULT_REVENUECAT_METRIC_DAYS - 1));

  return {
    dateFrom: toIsoDate(dateFrom),
    dateTo: toIsoDate(dateTo)
  };
}

export function assertUniqueResolvedRevenueCatProjects(apps: ResolvedRevenueCatProject[]): void {
  const appNameByProjectId = new Map<string, string>();

  for (const app of apps) {
    const existingAppName = appNameByProjectId.get(app.projectId);
    if (existingAppName) {
      throw new Error(
        `RevenueCat metrics/revenue is project-total only, so each active apps.revenuecat_project_id must map to exactly one dashboard app. ${existingAppName} and ${app.appName} both resolved to ${app.projectId}.`
      );
    }

    appNameByProjectId.set(app.projectId, app.appName);
  }
}
