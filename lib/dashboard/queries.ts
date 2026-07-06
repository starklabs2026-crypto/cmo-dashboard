import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase/server";
import { toFiniteNumber } from "@/lib/sync/money";
import { calculateCampaignRecommendation, calculatePnlMetrics } from "@/lib/sync/pnl";
import type {
  AppSummaryRow,
  CampaignAnalysisRow,
  DailyPnlRow,
  MonthlySummaryRow,
  SummaryKpis,
  SyncStatusRow
} from "@/lib/dashboard/types";

export type DashboardFilters = {
  dateFrom?: string;
  dateTo?: string;
  app?: string;
  search?: string;
  pnl?: "positive" | "negative";
};

function numeric(value: unknown): number {
  return toFiniteNumber(value);
}

function nullableNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = numeric(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 10000) / 10000;
}

function mapDailyPnl(row: Record<string, unknown>): DailyPnlRow {
  return {
    date: String(row.date),
    appName: String(row.app_name),
    revenueInr: numeric(row.revenue_inr),
    expectedLtvInr: numeric(row.expected_ltv_inr),
    adSpendInr: numeric(row.ad_spend_inr),
    otherCostsInr: numeric(row.other_costs_inr),
    netRevenueInr: numeric(row.net_revenue_inr),
    profitLossRevenueInr: numeric(row.profit_loss_revenue_inr),
    profitLossExpectedLtvInr: numeric(row.profit_loss_expected_ltv_inr),
    revenueRoas: nullableNumeric(row.revenue_roas),
    expectedLtvRoas: nullableNumeric(row.expected_ltv_roas),
    cac: nullableNumeric(row.cac),
    paybackPeriod: nullableNumeric(row.payback_period),
    trials: numeric(row.trials),
    paidConversions: numeric(row.paid_conversions),
    activeSubscriptions: numeric(row.active_subscriptions),
    cancellations: numeric(row.cancellations),
    hasRevenueData: Boolean(row.has_revenue_data),
    hasAdSpendData: Boolean(row.has_ad_spend_data),
    dataQualityNote: row.data_quality_note ? String(row.data_quality_note) : "Complete"
  };
}

export function getCurrentYearRange(now = new Date()) {
  const year = now.getUTCFullYear();
  return {
    dateFrom: `${year}-01-01`,
    dateTo: now.toISOString().slice(0, 10)
  };
}

export async function getDailyPnlRows(filters: DashboardFilters = {}): Promise<DailyPnlRow[]> {
  const supabase = createSupabaseAdmin();
  let query = supabase.from("daily_pnl").select("*").order("date", { ascending: false });

  if (filters.dateFrom) {
    query = query.gte("date", filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte("date", filters.dateTo);
  }

  if (filters.app && filters.app !== "all") {
    query = query.eq("app_name", filters.app);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  let rows = ((data ?? []) as Record<string, unknown>[]).map(mapDailyPnl);

  if (filters.search) {
    const search = filters.search.toLowerCase();
    rows = rows.filter(
      (row) =>
        row.appName.toLowerCase().includes(search) ||
        row.date.includes(search) ||
        row.dataQualityNote.toLowerCase().includes(search)
    );
  }

  if (filters.pnl === "positive") {
    rows = rows.filter((row) => row.profitLossRevenueInr >= 0);
  }

  if (filters.pnl === "negative") {
    rows = rows.filter((row) => row.profitLossRevenueInr < 0);
  }

  return rows;
}

export function summarizeApps(rows: DailyPnlRow[]): AppSummaryRow[] {
  const byApp = new Map<string, AppSummaryRow>();

  for (const row of rows) {
    const current =
      byApp.get(row.appName) ??
      ({
        appName: row.appName,
        revenueInr: 0,
        expectedLtvInr: 0,
        adSpendInr: 0,
        otherCostsInr: 0,
        netRevenueInr: 0,
        profitLossRevenueInr: 0,
        profitLossExpectedLtvInr: 0,
        revenueRoas: null,
        expectedLtvRoas: null,
        cac: null,
        paybackPeriod: null,
        trials: 0,
        paidConversions: 0,
        activeSubscriptions: 0,
        cancellations: 0
      } satisfies AppSummaryRow);

    current.revenueInr += row.revenueInr;
    current.expectedLtvInr += row.expectedLtvInr;
    current.adSpendInr += row.adSpendInr;
    current.otherCostsInr += row.otherCostsInr;
    current.netRevenueInr += row.netRevenueInr;
    current.profitLossRevenueInr += row.profitLossRevenueInr;
    current.profitLossExpectedLtvInr += row.profitLossExpectedLtvInr;
    current.trials += row.trials;
    current.paidConversions += row.paidConversions;
    current.activeSubscriptions = Math.max(current.activeSubscriptions, row.activeSubscriptions);
    current.cancellations += row.cancellations;

    byApp.set(row.appName, current);
  }

  return Array.from(byApp.values())
    .map((row) => {
      const metrics = calculatePnlMetrics({
        netRevenueInr: row.netRevenueInr,
        expectedLtvInr: row.expectedLtvInr,
        adSpendInr: row.adSpendInr,
        otherCostsInr: row.otherCostsInr,
        paidConversions: row.paidConversions,
        activeSubscriptions: row.activeSubscriptions
      });

      return {
        ...row,
        revenueRoas: metrics.revenueRoas,
        expectedLtvRoas: metrics.expectedLtvRoas,
        cac: metrics.cac,
        paybackPeriod: metrics.paybackPeriod
      };
    })
    .sort((a, b) => b.profitLossRevenueInr - a.profitLossRevenueInr);
}

export function summarizeKpis(rows: DailyPnlRow[]): SummaryKpis {
  const appSummary = summarizeApps(rows);
  const totals = rows.reduce(
    (acc, row) => {
      acc.ytdRevenueInr += row.revenueInr;
      acc.ytdExpectedLtvInr += row.expectedLtvInr;
      acc.ytdAdSpendInr += row.adSpendInr;
      acc.profitLossRevenueInr += row.profitLossRevenueInr;
      acc.profitLossExpectedLtvInr += row.profitLossExpectedLtvInr;
      acc.netRevenueInr += row.netRevenueInr;
      return acc;
    },
    {
      ytdRevenueInr: 0,
      ytdExpectedLtvInr: 0,
      ytdAdSpendInr: 0,
      profitLossRevenueInr: 0,
      profitLossExpectedLtvInr: 0,
      netRevenueInr: 0
    }
  );

  const best = appSummary[0];
  const worst = appSummary.length > 0 ? appSummary[appSummary.length - 1] : undefined;

  return {
    ytdRevenueInr: totals.ytdRevenueInr,
    ytdExpectedLtvInr: totals.ytdExpectedLtvInr,
    ytdAdSpendInr: totals.ytdAdSpendInr,
    profitLossRevenueInr: totals.profitLossRevenueInr,
    profitLossExpectedLtvInr: totals.profitLossExpectedLtvInr,
    revenueRoas: safeRatio(totals.netRevenueInr, totals.ytdAdSpendInr),
    expectedLtvRoas: safeRatio(totals.ytdExpectedLtvInr, totals.ytdAdSpendInr),
    bestPerformingApp: best?.appName ?? null,
    worstPerformingApp: worst?.appName ?? null
  };
}

export async function getSummary(filters: DashboardFilters = {}) {
  const range = filters.dateFrom || filters.dateTo ? filters : { ...getCurrentYearRange(), ...filters };
  const rows = await getDailyPnlRows(range);
  return {
    kpis: summarizeKpis(rows),
    appSummary: summarizeApps(rows),
    daily: rows
  };
}

export function summarizeMonthly(rows: DailyPnlRow[]): MonthlySummaryRow[] {
  const byKey = new Map<string, MonthlySummaryRow>();

  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const key = `${month}:${row.appName}`;
    const current =
      byKey.get(key) ??
      ({
        month,
        appName: row.appName,
        monthlyRevenueInr: 0,
        monthlyExpectedLtvInr: 0,
        monthlyAdSpendInr: 0,
        monthlyProfitLossRevenueInr: 0,
        monthlyProfitLossExpectedLtvInr: 0,
        monthlyRoas: null,
        momGrowthPercent: null
      } satisfies MonthlySummaryRow);

    current.monthlyRevenueInr += row.revenueInr;
    current.monthlyExpectedLtvInr += row.expectedLtvInr;
    current.monthlyAdSpendInr += row.adSpendInr;
    current.monthlyProfitLossRevenueInr += row.profitLossRevenueInr;
    current.monthlyProfitLossExpectedLtvInr += row.profitLossExpectedLtvInr;
    byKey.set(key, current);
  }

  const rowsByMonth = Array.from(byKey.values()).sort((a, b) =>
    `${a.appName}:${a.month}`.localeCompare(`${b.appName}:${b.month}`)
  );
  const previousByApp = new Map<string, MonthlySummaryRow>();

  for (const row of rowsByMonth) {
    row.monthlyRoas = safeRatio(row.monthlyRevenueInr, row.monthlyAdSpendInr);
    const previous = previousByApp.get(row.appName);
    row.momGrowthPercent =
      previous && previous.monthlyRevenueInr !== 0
        ? safeRatio(row.monthlyRevenueInr - previous.monthlyRevenueInr, previous.monthlyRevenueInr)
        : null;
    previousByApp.set(row.appName, row);
  }

  return rowsByMonth.sort((a, b) => b.month.localeCompare(a.month) || a.appName.localeCompare(b.appName));
}

export async function getMonthlySummary(filters: DashboardFilters = {}) {
  const rows = await getDailyPnlRows(filters);
  return summarizeMonthly(rows);
}

export async function getCampaignAnalysis(filters: DashboardFilters = {}): Promise<CampaignAnalysisRow[]> {
  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("daily_ad_spend")
    .select("*, apps(app_name)")
    .order("date", { ascending: false });

  if (filters.dateFrom) {
    query = query.gte("date", filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte("date", filters.dateTo);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const pnlRows = await getDailyPnlRows(filters);
  const appRatios = new Map(
    summarizeApps(pnlRows).map((row) => [
      row.appName,
      { revenueRoas: row.revenueRoas, expectedLtvRoas: row.expectedLtvRoas }
    ])
  );
  const groups = new Map<string, CampaignAnalysisRow>();

  for (const rawRow of (data ?? []) as Record<string, unknown>[]) {
    const relation = rawRow.apps as { app_name?: string } | null;
    const appName = relation?.app_name ?? "Unknown";

    if (filters.app && filters.app !== "all" && appName !== filters.app) {
      continue;
    }

    const source = String(rawRow.source ?? "Unknown");
    const campaign = String(rawRow.campaign ?? "Unattributed");
    const adGroup = String(rawRow.ad_group ?? "Unattributed");
    const keyword = String(rawRow.keyword ?? "Unattributed");
    const key = [appName, source, campaign, adGroup, keyword].join("|");
    const current =
      groups.get(key) ??
      ({
        appName,
        source,
        campaign,
        adGroup,
        keyword,
        spendInr: 0,
        impressions: 0,
        clicks: 0,
        ctr: null,
        cpc: null,
        installs: 0,
        cpi: null,
        recommendation: "Insufficient data"
      } satisfies CampaignAnalysisRow);

    current.spendInr += numeric(rawRow.spend_inr);
    current.impressions += numeric(rawRow.impressions);
    current.clicks += numeric(rawRow.clicks);
    current.installs += numeric(rawRow.installs);
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .map((row) => {
      row.ctr = safeRatio(row.clicks, row.impressions);
      row.cpc = safeRatio(row.spendInr, row.clicks);
      row.cpi = safeRatio(row.spendInr, row.installs);
      const appRatio = appRatios.get(row.appName);
      row.recommendation = calculateCampaignRecommendation({
        spendInr: row.spendInr,
        installs: row.installs,
        cpi: row.cpi,
        revenueRoas: appRatio?.revenueRoas ?? null,
        expectedLtvRoas: appRatio?.expectedLtvRoas ?? null
      });
      return row;
    })
    .filter((row) => {
      if (!filters.search) {
        return true;
      }

      const search = filters.search.toLowerCase();
      return [row.appName, row.source, row.campaign, row.adGroup, row.keyword, row.recommendation]
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort((a, b) => b.spendInr - a.spendInr);
}

export async function getSyncStatus(): Promise<SyncStatusRow[]> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("sync_runs")
    .select("source, sync_started_at, sync_finished_at, status, rows_synced, error_message")
    .order("sync_started_at", { ascending: false })
    .limit(30);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    source: String(row.source),
    syncStartedAt: String(row.sync_started_at),
    syncFinishedAt: row.sync_finished_at ? String(row.sync_finished_at) : null,
    status: row.status ? String(row.status) : null,
    rowsSynced: numeric(row.rows_synced),
    errorMessage: row.error_message ? String(row.error_message) : null
  }));
}
