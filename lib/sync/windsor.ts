import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getOptionalEnv, getRequiredEnv, getUsdToInr } from "@/lib/server/env";
import { convertCurrencyToInr, toFiniteNumber } from "@/lib/sync/money";
import { getDefaultSyncDateRange } from "@/lib/sync/dates";
import {
  DEFAULT_APP_MAPPINGS,
  mapWindsorRowToAppName,
  type AppMapping
} from "@/lib/sync/app-mapping";
import { finishSyncRun, startSyncRun, type SyncRunResult } from "@/lib/sync/sync-run";

type Fetcher = typeof fetch;

type WindsorSyncOptions = {
  dateFrom?: string;
  dateTo?: string;
  fetcher?: Fetcher;
};

type AppRow = {
  id: string;
  app_name: string;
  windsor_app_names: string[] | null;
  campaign_aliases: string[] | null;
};

type WindsorRow = {
  date?: string | null;
  source?: string | null;
  datasource?: string | null;
  campaign?: string | null;
  campaign_id?: string | null;
  ad_group_name?: string | null;
  ad_group_id?: string | null;
  keyword?: string | null;
  app?: string | null;
  countries_or_regions?: string | null;
  currency?: string | null;
  spend?: string | number | null;
  impressions?: string | number | null;
  clicks?: string | number | null;
  taps?: string | number | null;
  installs?: string | number | null;
  number_of_installs?: string | number | null;
  conversions?: string | number | null;
};

const WINDSOR_FIELDS = [
  "date",
  "source",
  "datasource",
  "campaign",
  "campaign_id",
  "ad_group_name",
  "ad_group_id",
  "keyword",
  "keyword_id",
  "app",
  "countries_or_regions",
  "currency",
  "spend",
  "impressions",
  "clicks",
  "taps",
  "installs",
  "number_of_installs",
  "conversion_rate"
];

function normalizeWindsorRows(payload: unknown): WindsorRow[] {
  if (Array.isArray(payload)) {
    return payload as WindsorRow[];
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data as WindsorRow[];
    }
  }

  return [];
}

function createMappingsFromApps(apps: AppRow[]): AppMapping[] {
  return apps.map((app) => {
    const defaultMapping = DEFAULT_APP_MAPPINGS.find((mapping) => mapping.appName === app.app_name);
    return {
      appName: app.app_name as AppMapping["appName"],
      revenueCatProjectNames: defaultMapping?.revenueCatProjectNames ?? [app.app_name],
      windsorAppNames:
        app.windsor_app_names && app.windsor_app_names.length > 0
          ? app.windsor_app_names
          : defaultMapping?.windsorAppNames ?? [app.app_name],
      campaignAliases:
        app.campaign_aliases && app.campaign_aliases.length > 0
          ? app.campaign_aliases
          : defaultMapping?.campaignAliases ?? [app.app_name]
    };
  });
}

async function fetchWindsorRows(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  fetcher: Fetcher
): Promise<WindsorRow[]> {
  const connector = getOptionalEnv("WINDSOR_CONNECTOR") ?? "all";
  const url = new URL(`/${connector}`, "https://connectors.windsor.ai");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("fields", WINDSOR_FIELDS.join(","));
  url.searchParams.set("date_from", dateFrom);
  url.searchParams.set("date_to", dateTo);
  url.searchParams.set("_max_rows", "50000");

  const response = await fetcher(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Windsor/1.0"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Windsor ${response.status}: ${text.slice(0, 300)}`);
  }

  return normalizeWindsorRows(await response.json());
}

export async function runWindsorSync(options: WindsorSyncOptions = {}): Promise<SyncRunResult> {
  const supabase = createSupabaseAdmin();
  const runId = await startSyncRun(supabase, "windsor");
  const apiKey = getRequiredEnv("WINDSOR_API_KEY");
  const fxRate = getUsdToInr();
  const fetcher = options.fetcher ?? fetch;
  const { dateFrom, dateTo } =
    options.dateFrom && options.dateTo
      ? { dateFrom: options.dateFrom, dateTo: options.dateTo }
      : getDefaultSyncDateRange();

  try {
    const { data: apps, error: appsError } = await supabase
      .from("apps")
      .select("id, app_name, windsor_app_names, campaign_aliases")
      .eq("is_active", true);

    if (appsError) {
      throw appsError;
    }

    const appRows = (apps ?? []) as AppRow[];
    const mappings = createMappingsFromApps(appRows);
    const appIdByName = new Map(appRows.map((app) => [app.app_name, app.id]));
    const windsorRows = await fetchWindsorRows(apiKey, dateFrom, dateTo, fetcher);
    const rows = [];

    for (const row of windsorRows) {
      if (!row.date) {
        continue;
      }

      const appName = mapWindsorRowToAppName(
        {
          app: row.app,
          campaign: row.campaign,
          campaign_id: row.campaign_id,
          ad_group_name: row.ad_group_name,
          keyword: row.keyword
        },
        mappings
      );
      const appId = appName ? appIdByName.get(appName) : undefined;

      if (!appId) {
        continue;
      }

      const clicks = toFiniteNumber(row.clicks) || toFiniteNumber(row.taps);
      const installs = toFiniteNumber(row.installs) || toFiniteNumber(row.number_of_installs);

      rows.push({
        date: row.date,
        app_id: appId,
        source: row.source ?? row.datasource ?? "apple_search_ads",
        medium: row.datasource ?? "paid",
        campaign: row.campaign ?? null,
        campaign_id: row.campaign_id ?? null,
        ad_group: row.ad_group_name ?? null,
        ad_group_id: row.ad_group_id ?? null,
        keyword: row.keyword ?? null,
        country: row.countries_or_regions ?? null,
        spend_inr: convertCurrencyToInr(row.spend, row.currency, fxRate),
        impressions: Math.round(toFiniteNumber(row.impressions)),
        clicks: Math.round(clicks),
        installs: Math.round(installs),
        conversions: Math.round(toFiniteNumber(row.conversions)),
        source_last_updated_at: new Date().toISOString()
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("daily_ad_spend").upsert(rows, {
        onConflict:
          "date,app_id,source,medium,campaign,campaign_id,ad_group,ad_group_id,keyword,country"
      });

      if (error) {
        throw error;
      }
    }

    await finishSyncRun(supabase, runId, "success", rows.length);
    return { id: runId, source: "windsor", status: "success", rowsSynced: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Windsor sync error";
    await finishSyncRun(supabase, runId, "failed", 0, message);
    return { id: runId, source: "windsor", status: "failed", rowsSynced: 0, errorMessage: message };
  }
}
