import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getUsdToInr } from "@/lib/server/env";
import { getRevenueCatApiKeyForApp } from "@/lib/sync/revenuecat-keys";
import { extractRevenueCatDailySeries } from "@/lib/sync/revenuecat-series";
import { convertUsdToInr, toFiniteNumber } from "@/lib/sync/money";
import { enumerateDates, getDefaultSyncDateRange } from "@/lib/sync/dates";
import { getSyncErrorMessage } from "@/lib/sync/error-message";
import { finishSyncRun, startSyncRun, type SyncRunResult } from "@/lib/sync/sync-run";

type Fetcher = typeof fetch;

type RevenueCatSyncOptions = {
  dateFrom?: string;
  dateTo?: string;
  fetcher?: Fetcher;
};

type AppRow = {
  id: string;
  app_name: string;
  revenuecat_project_id: string | null;
};

type ChartOptions = {
  selectors?: Record<string, string>;
  preferredKeys?: string[];
};

const REVENUECAT_BASE_URL = "https://api.revenuecat.com/v2";

function isLikelyRevenueCatProjectId(value: string): boolean {
  return /^proj[a-z0-9_]+/i.test(value);
}

async function revenueCatFetchJson(
  path: string,
  apiKey: string,
  fetcher: Fetcher,
  attempt = 0
): Promise<unknown> {
  const response = await fetcher(`${REVENUECAT_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (response.status === 429 && attempt < 3) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After") ?? "1");
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfterSeconds) * 1000));
    return revenueCatFetchJson(path, apiKey, fetcher, attempt + 1);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RevenueCat ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json();
}

async function resolveProjectId(
  projectIdentifier: string,
  apiKey: string,
  fetcher: Fetcher
): Promise<string> {
  if (isLikelyRevenueCatProjectId(projectIdentifier)) {
    return projectIdentifier;
  }

  try {
    const payload = await revenueCatFetchJson("/projects", apiKey, fetcher);
    const items =
      payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown[] }).items)
        ? ((payload as { items: Record<string, unknown>[] }).items)
        : [];
    const normalizedIdentifier = projectIdentifier.toLowerCase();
    const match = items.find((item) => {
      const name = String(item.name ?? item.display_name ?? "").toLowerCase();
      const id = String(item.id ?? "").toLowerCase();
      return name === normalizedIdentifier || id === normalizedIdentifier;
    });

    return match?.id ? String(match.id) : projectIdentifier;
  } catch (error) {
    console.warn("Could not resolve RevenueCat project name to id", projectIdentifier, error);
    return projectIdentifier;
  }
}

async function fetchChartSeries(
  projectId: string,
  chartName: string,
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  fetcher: Fetcher,
  options: ChartOptions = {}
): Promise<Map<string, number>> {
  const url = new URL(`/v2/projects/${encodeURIComponent(projectId)}/charts/${chartName}`, REVENUECAT_BASE_URL);
  url.searchParams.set("start_date", dateFrom);
  url.searchParams.set("end_date", dateTo);
  url.searchParams.set("currency", "USD");
  url.searchParams.set("resolution", "day");
  url.searchParams.set("expand_periods", "false");

  if (options.selectors) {
    url.searchParams.set("selectors", JSON.stringify(options.selectors));
  }

  const payload = await revenueCatFetchJson(url.pathname.replace("/v2", "") + url.search, apiKey, fetcher);
  return extractRevenueCatDailySeries(payload, options.preferredKeys);
}

export async function runRevenueCatSync(options: RevenueCatSyncOptions = {}): Promise<SyncRunResult> {
  const supabase = createSupabaseAdmin();
  const runId = await startSyncRun(supabase, "revenuecat");
  const fxRate = getUsdToInr();
  const fetcher = options.fetcher ?? fetch;
  const { dateFrom, dateTo } =
    options.dateFrom && options.dateTo
      ? { dateFrom: options.dateFrom, dateTo: options.dateTo }
      : getDefaultSyncDateRange();

  try {
    const { data: apps, error: appsError } = await supabase
      .from("apps")
      .select("id, app_name, revenuecat_project_id")
      .eq("is_active", true)
      .not("revenuecat_project_id", "is", null);

    if (appsError) {
      throw appsError;
    }

    const rows = [];

    for (const app of (apps ?? []) as AppRow[]) {
      if (!app.revenuecat_project_id) {
        continue;
      }

      const apiKey = getRevenueCatApiKeyForApp(app.app_name, app.revenuecat_project_id);
      const projectId = await resolveProjectId(app.revenuecat_project_id, apiKey, fetcher);
      const [revenue, expectedLtv, refunds, trials, paidConversions, actives, cancellations] =
        await Promise.allSettled([
          fetchChartSeries(projectId, "revenue", apiKey, dateFrom, dateTo, fetcher, {
            selectors: { revenue_type: "proceeds" },
            preferredKeys: ["proceeds", "revenue_net_of_taxes", "revenue", "value", "amount"]
          }),
          fetchChartSeries(projectId, "prediction_explorer", apiKey, dateFrom, dateTo, fetcher),
          fetchChartSeries(projectId, "refund_rate", apiKey, dateFrom, dateTo, fetcher, {
            selectors: { revenue_type: "proceeds" },
            preferredKeys: ["proceeds", "refund", "refunds", "value", "amount"]
          }),
          fetchChartSeries(projectId, "trials_new", apiKey, dateFrom, dateTo, fetcher),
          fetchChartSeries(projectId, "actives_new", apiKey, dateFrom, dateTo, fetcher),
          fetchChartSeries(projectId, "actives", apiKey, dateFrom, dateTo, fetcher),
          fetchChartSeries(projectId, "churn", apiKey, dateFrom, dateTo, fetcher)
        ]);

      const revenueSeries = revenue.status === "fulfilled" ? revenue.value : new Map<string, number>();
      const expectedLtvSeries = expectedLtv.status === "fulfilled" ? expectedLtv.value : new Map<string, number>();
      const refundsSeries = refunds.status === "fulfilled" ? refunds.value : new Map<string, number>();
      const trialsSeries = trials.status === "fulfilled" ? trials.value : new Map<string, number>();
      const paidConversionsSeries =
        paidConversions.status === "fulfilled" ? paidConversions.value : new Map<string, number>();
      const activesSeries = actives.status === "fulfilled" ? actives.value : new Map<string, number>();
      const cancellationsSeries =
        cancellations.status === "fulfilled" ? cancellations.value : new Map<string, number>();

      for (const date of enumerateDates(dateFrom, dateTo)) {
        const revenueInr = convertUsdToInr(revenueSeries.get(date) ?? 0, fxRate);
        const refundsInr = convertUsdToInr(refundsSeries.get(date) ?? 0, fxRate);

        rows.push({
          date,
          app_id: app.id,
          revenue_inr: revenueInr,
          expected_ltv_inr: convertUsdToInr(expectedLtvSeries.get(date) ?? 0, fxRate),
          refunds_inr: refundsInr,
          net_revenue_inr: Math.max(0, revenueInr - refundsInr),
          trials: Math.round(toFiniteNumber(trialsSeries.get(date))),
          paid_conversions: Math.round(toFiniteNumber(paidConversionsSeries.get(date))),
          active_subscriptions: Math.round(toFiniteNumber(activesSeries.get(date))),
          cancellations: Math.round(toFiniteNumber(cancellationsSeries.get(date))),
          source: "revenuecat",
          source_last_updated_at: new Date().toISOString()
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("daily_revenue")
        .upsert(rows, { onConflict: "date,app_id" });

      if (error) {
        throw error;
      }
    }

    await finishSyncRun(supabase, runId, "success", rows.length);
    return { id: runId, source: "revenuecat", status: "success", rowsSynced: rows.length };
  } catch (error) {
    const message = getSyncErrorMessage(error, "Unknown RevenueCat sync error");
    await finishSyncRun(supabase, runId, "failed", 0, message);
    return { id: runId, source: "revenuecat", status: "failed", rowsSynced: 0, errorMessage: message };
  }
}
