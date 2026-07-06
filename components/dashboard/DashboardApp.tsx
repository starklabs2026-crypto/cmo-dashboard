"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  RefreshCw,
  Search,
  ShieldCheck
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatInr, formatRatio } from "@/lib/sync/money";
import type {
  AppSummaryRow,
  CampaignAnalysisRow,
  DailyPnlRow,
  MonthlySummaryRow,
  SummaryKpis,
  SyncStatusRow
} from "@/lib/dashboard/types";

const APP_OPTIONS = ["Cado", "Dishit", "Medzy", "Crylens", "Fernly", "Rate My Skin"];
const COLORS = ["#2563eb", "#0f8f55", "#c2410c", "#7c3aed", "#0f766e", "#be123c"];
const TABS = [
  "Executive Dashboard",
  "Daily P&L",
  "App Summary",
  "Monthly Summary",
  "Campaign Analysis",
  "Sync Health"
] as const;

type Tab = (typeof TABS)[number];

type SummaryResponse = {
  kpis: SummaryKpis;
  appSummary: AppSummaryRow[];
  daily: DailyPnlRow[];
};

function currentYearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function numberCell(value: number | null | undefined) {
  return value === null || value === undefined ? "NA" : formatRatio(value);
}

function percentCell(value: number | null | undefined) {
  return value === null || value === undefined ? "NA" : `${(value * 100).toFixed(2)}%`;
}

function moneyClass(value: number) {
  return value >= 0 ? "text-profit" : "text-loss";
}

function buildQuery(filters: {
  dateFrom: string;
  dateTo: string;
  app: string;
  pnl: string;
  search: string;
}) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (filters.app !== "all") params.set("app", filters.app);
  if (filters.pnl !== "all") params.set("pnl", filters.pnl);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function loadDashboardData(query: string) {
  const [summaryData, dailyData, monthlyData, campaignData, syncData] = await Promise.all([
    fetchJson<SummaryResponse>(`/api/dashboard/summary${query}`),
    fetchJson<{ rows: DailyPnlRow[] }>(`/api/dashboard/daily-pnl${query}`),
    fetchJson<{ rows: MonthlySummaryRow[] }>(`/api/dashboard/monthly-summary${query}`),
    fetchJson<{ rows: CampaignAnalysisRow[] }>(`/api/dashboard/campaigns${query}`),
    fetchJson<{ rows: SyncStatusRow[] }>("/api/sync/status")
  ]);

  return {
    summaryData,
    dailyRows: dailyData.rows,
    monthlyRows: monthlyData.rows,
    campaignRows: campaignData.rows,
    syncRows: syncData.rows
  };
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-line bg-white px-4 text-sm text-muted">
      {label}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-line bg-white px-4 text-sm text-muted">
      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
      Loading dashboard data
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "neutral",
  icon
}: {
  label: string;
  value: string;
  tone?: "neutral" | "profit" | "loss";
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-normal text-muted">{label}</p>
        <div className="text-muted">{icon}</div>
      </div>
      <p
        className={classNames(
          "mt-3 break-words text-2xl font-semibold tracking-normal",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
          tone === "neutral" && "text-ink"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-h-80 rounded-md border border-line bg-white p-4 shadow-soft">
      <h2 className="mb-4 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function pivotDaily(rows: DailyPnlRow[], metric: keyof DailyPnlRow) {
  const byDate = new Map<string, Record<string, string | number>>();

  for (const row of rows) {
    const current = byDate.get(row.date) ?? { date: row.date };
    current[row.appName] = Number(row[metric] ?? 0);
    byDate.set(row.date, current);
  }

  return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function MultiLineChart({ rows, metric }: { rows: DailyPnlRow[]; metric: keyof DailyPnlRow }) {
  const data = useMemo(() => pivotDaily(rows, metric), [rows, metric]);

  if (data.length === 0) {
    return <EmptyState label="No chart data yet" />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="#edf1f7" />
        <XAxis dataKey="date" />
        <YAxis width={88} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
        <Tooltip formatter={(value) => formatInr(Number(value))} />
        <Legend />
        {APP_OPTIONS.map((app, index) => (
          <Line
            key={app}
            type="monotone"
            dataKey={app}
            stroke={COLORS[index % COLORS.length]}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function CompareBarChart({ rows, expected = false }: { rows: DailyPnlRow[]; expected?: boolean }) {
  const data = useMemo(() => {
    const byDate = new Map<string, { date: string; revenue: number; spend: number }>();
    for (const row of rows) {
      const current = byDate.get(row.date) ?? { date: row.date, revenue: 0, spend: 0 };
      current.revenue += expected ? row.expectedLtvInr : row.netRevenueInr;
      current.spend += row.adSpendInr;
      byDate.set(row.date, current);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, expected]);

  if (data.length === 0) {
    return <EmptyState label="No chart data yet" />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="#edf1f7" />
        <XAxis dataKey="date" />
        <YAxis width={88} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
        <Tooltip formatter={(value) => formatInr(Number(value))} />
        <Legend />
        <Bar dataKey="revenue" name={expected ? "Expected LTV" : "Net Revenue"} fill="#0f8f55" />
        <Bar dataKey="spend" name="Ad Spend" fill="#c93434" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function AppMetricBar({
  rows,
  metric,
  label
}: {
  rows: AppSummaryRow[];
  metric: keyof AppSummaryRow;
  label: string;
}) {
  if (rows.length === 0) {
    return <EmptyState label="No app summary yet" />;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 40 }}>
        <CartesianGrid stroke="#edf1f7" />
        <XAxis dataKey="appName" interval={0} angle={-25} textAnchor="end" height={70} />
        <YAxis width={76} />
        <Tooltip formatter={(value) => (typeof value === "number" ? numberCell(value) : String(value))} />
        <Bar dataKey={metric} name={label} fill="#2563eb" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Filters({
  filters,
  setFilters
}: {
  filters: { dateFrom: string; dateTo: string; app: string; pnl: string; search: string };
  setFilters: React.Dispatch<
    React.SetStateAction<{ dateFrom: string; dateTo: string; app: string; pnl: string; search: string }>
  >;
}) {
  return (
    <div className="grid gap-3 border-y border-line bg-white px-4 py-3 md:grid-cols-[160px_160px_170px_180px_1fr]">
      <input
        type="date"
        value={filters.dateFrom}
        onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
        className="h-10 rounded-md border border-line px-3 text-sm"
        aria-label="Date from"
      />
      <input
        type="date"
        value={filters.dateTo}
        onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
        className="h-10 rounded-md border border-line px-3 text-sm"
        aria-label="Date to"
      />
      <select
        value={filters.app}
        onChange={(event) => setFilters((current) => ({ ...current, app: event.target.value }))}
        className="h-10 rounded-md border border-line px-3 text-sm"
        aria-label="App"
      >
        <option value="all">All apps</option>
        {APP_OPTIONS.map((app) => (
          <option key={app} value={app}>
            {app}
          </option>
        ))}
      </select>
      <select
        value={filters.pnl}
        onChange={(event) => setFilters((current) => ({ ...current, pnl: event.target.value }))}
        className="h-10 rounded-md border border-line px-3 text-sm"
        aria-label="P&L filter"
      >
        <option value="all">All P&L</option>
        <option value="positive">Positive P&L</option>
        <option value="negative">Negative P&L</option>
      </select>
      <label className="flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm">
        <Search className="h-4 w-4 text-muted" />
        <input
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          className="w-full outline-none"
          placeholder="Search"
        />
      </label>
    </div>
  );
}

function ExecutiveDashboard({
  summary,
  loading
}: {
  summary: SummaryResponse | null;
  loading: boolean;
}) {
  if (loading) return <LoadingState />;
  if (!summary) return <EmptyState label="No dashboard data yet" />;

  const kpis = summary.kpis;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <KpiCard label="YTD Revenue INR" value={formatInr(kpis.ytdRevenueInr)} icon={<CircleDollarSign />} />
        <KpiCard label="YTD Expected LTV INR" value={formatInr(kpis.ytdExpectedLtvInr)} />
        <KpiCard label="YTD Ad Spend INR" value={formatInr(kpis.ytdAdSpendInr)} />
        <KpiCard
          label="P/L on Revenue INR"
          value={formatInr(kpis.profitLossRevenueInr)}
          tone={kpis.profitLossRevenueInr >= 0 ? "profit" : "loss"}
          icon={kpis.profitLossRevenueInr >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}
        />
        <KpiCard
          label="P/L on Expected LTV INR"
          value={formatInr(kpis.profitLossExpectedLtvInr)}
          tone={kpis.profitLossExpectedLtvInr >= 0 ? "profit" : "loss"}
        />
        <KpiCard label="Revenue ROAS" value={numberCell(kpis.revenueRoas)} />
        <KpiCard label="Expected LTV ROAS" value={numberCell(kpis.expectedLtvRoas)} />
        <KpiCard label="Best Performing App" value={kpis.bestPerformingApp ?? "NA"} />
        <KpiCard label="Worst Performing App" value={kpis.worstPerformingApp ?? "NA"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartShell title="Daily revenue by app">
          <MultiLineChart rows={summary.daily} metric="netRevenueInr" />
        </ChartShell>
        <ChartShell title="Daily ad spend by app">
          <MultiLineChart rows={summary.daily} metric="adSpendInr" />
        </ChartShell>
        <ChartShell title="Daily P&L by app">
          <MultiLineChart rows={summary.daily} metric="profitLossRevenueInr" />
        </ChartShell>
        <ChartShell title="Revenue vs ad spend">
          <CompareBarChart rows={summary.daily} />
        </ChartShell>
        <ChartShell title="Expected LTV vs ad spend">
          <CompareBarChart rows={summary.daily} expected />
        </ChartShell>
        <ChartShell title="ROAS by app">
          <AppMetricBar rows={summary.appSummary} metric="revenueRoas" label="Revenue ROAS" />
        </ChartShell>
        <ChartShell title="Payback period by app">
          <AppMetricBar rows={summary.appSummary} metric="paybackPeriod" label="Payback Period" />
        </ChartShell>
      </div>
    </div>
  );
}

function DailyPnlTable({ rows, loading }: { rows: DailyPnlRow[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (rows.length === 0) return <EmptyState label="No daily P&L rows match the current filters" />;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-white shadow-soft">
      <div className="max-h-[620px] overflow-auto">
        <table className="min-w-[1280px] w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[#edf3ff] text-xs uppercase text-muted">
            <tr>
              {[
                "Date",
                "App",
                "Revenue INR",
                "Expected LTV INR",
                "Ad Spend INR",
                "Other Costs INR",
                "Profit / Loss on Revenue INR",
                "Profit / Loss on Expected LTV INR",
                "Payback Period",
                "Data Quality Note"
              ].map((heading) => (
                <th key={heading} className="border-b border-line px-3 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.date}-${row.appName}`} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-3">{row.date}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium">{row.appName}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.revenueInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.expectedLtvInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.adSpendInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.otherCostsInr)}</td>
                <td className={classNames("whitespace-nowrap px-3 py-3 font-semibold", moneyClass(row.profitLossRevenueInr))}>
                  {formatInr(row.profitLossRevenueInr)}
                </td>
                <td className={classNames("whitespace-nowrap px-3 py-3 font-semibold", moneyClass(row.profitLossExpectedLtvInr))}>
                  {formatInr(row.profitLossExpectedLtvInr)}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{numberCell(row.paybackPeriod)}</td>
                <td className="min-w-72 px-3 py-3 text-muted">
                  {row.dataQualityNote === "Complete" ? (
                    <span className="inline-flex items-center gap-1 text-profit">
                      <ShieldCheck className="h-4 w-4" />
                      Complete
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber">
                      <AlertTriangle className="h-4 w-4" />
                      {row.dataQualityNote}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AppSummaryTable({ rows, loading }: { rows: AppSummaryRow[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (rows.length === 0) return <EmptyState label="No app summary yet" />;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-white shadow-soft">
      <div className="overflow-auto">
        <table className="min-w-[1320px] w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[#edf3ff] text-xs uppercase text-muted">
            <tr>
              {[
                "App",
                "Revenue INR",
                "Expected LTV INR",
                "Ad Spend INR",
                "Other Costs INR",
                "Net Revenue INR",
                "P/L Revenue INR",
                "P/L Expected LTV INR",
                "ROAS",
                "LTV ROAS",
                "CAC",
                "Payback Period",
                "Trials",
                "Paid Conversions",
                "Active Subscriptions",
                "Cancellations"
              ].map((heading) => (
                <th key={heading} className="border-b border-line px-3 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.appName} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-3 font-medium">{row.appName}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.revenueInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.expectedLtvInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.adSpendInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.otherCostsInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.netRevenueInr)}</td>
                <td className={classNames("whitespace-nowrap px-3 py-3 font-semibold", moneyClass(row.profitLossRevenueInr))}>
                  {formatInr(row.profitLossRevenueInr)}
                </td>
                <td className={classNames("whitespace-nowrap px-3 py-3 font-semibold", moneyClass(row.profitLossExpectedLtvInr))}>
                  {formatInr(row.profitLossExpectedLtvInr)}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{numberCell(row.revenueRoas)}</td>
                <td className="whitespace-nowrap px-3 py-3">{numberCell(row.expectedLtvRoas)}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.cac === null ? "NA" : formatInr(row.cac)}</td>
                <td className="whitespace-nowrap px-3 py-3">{numberCell(row.paybackPeriod)}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.trials}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.paidConversions}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.activeSubscriptions}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.cancellations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlyTable({ rows, loading }: { rows: MonthlySummaryRow[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (rows.length === 0) return <EmptyState label="No monthly summary yet" />;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-white shadow-soft">
      <div className="overflow-auto">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[#edf3ff] text-xs uppercase text-muted">
            <tr>
              {[
                "Month",
                "App",
                "Monthly Revenue INR",
                "Monthly Expected LTV INR",
                "Monthly Ad Spend INR",
                "Monthly P/L on Revenue",
                "Monthly P/L on Expected LTV",
                "Monthly ROAS",
                "MoM Growth / Decline"
              ].map((heading) => (
                <th key={heading} className="border-b border-line px-3 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.month}-${row.appName}`} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-3">{row.month}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium">{row.appName}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.monthlyRevenueInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.monthlyExpectedLtvInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.monthlyAdSpendInr)}</td>
                <td className={classNames("whitespace-nowrap px-3 py-3 font-semibold", moneyClass(row.monthlyProfitLossRevenueInr))}>
                  {formatInr(row.monthlyProfitLossRevenueInr)}
                </td>
                <td className={classNames("whitespace-nowrap px-3 py-3 font-semibold", moneyClass(row.monthlyProfitLossExpectedLtvInr))}>
                  {formatInr(row.monthlyProfitLossExpectedLtvInr)}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{numberCell(row.monthlyRoas)}</td>
                <td className="whitespace-nowrap px-3 py-3">{percentCell(row.momGrowthPercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignTable({ rows, loading }: { rows: CampaignAnalysisRow[]; loading: boolean }) {
  if (loading) return <LoadingState />;
  if (rows.length === 0) return <EmptyState label="No campaign rows match the current filters" />;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-white shadow-soft">
      <div className="max-h-[620px] overflow-auto">
        <table className="min-w-[1240px] w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[#edf3ff] text-xs uppercase text-muted">
            <tr>
              {[
                "App",
                "Source",
                "Campaign",
                "Ad Group",
                "Keyword",
                "Spend INR",
                "Impressions",
                "Clicks",
                "CTR",
                "CPC",
                "Installs",
                "CPI",
                "Recommendation"
              ].map((heading) => (
                <th key={heading} className="border-b border-line px-3 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.appName}-${row.source}-${row.campaign}-${row.adGroup}-${row.keyword}`} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-3 py-3 font-medium">{row.appName}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.source}</td>
                <td className="min-w-64 px-3 py-3">{row.campaign}</td>
                <td className="min-w-56 px-3 py-3">{row.adGroup}</td>
                <td className="min-w-48 px-3 py-3">{row.keyword}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatInr(row.spendInr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.impressions}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.clicks}</td>
                <td className="whitespace-nowrap px-3 py-3">{percentCell(row.ctr)}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.cpc === null ? "NA" : formatInr(row.cpc)}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.installs}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.cpi === null ? "NA" : formatInr(row.cpi)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium">{row.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SyncHealth({
  rows,
  loading,
  onRefresh
}: {
  rows: SyncStatusRow[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [secret, setSecret] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function runSync(kind: "revenuecat" | "windsor" | "all") {
    setSyncing(kind);
    setMessage(null);
    try {
      const response = await fetch(`/api/sync/${kind}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Sync failed");
      }
      setMessage("Sync request finished");
      onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-line bg-white p-4 shadow-soft">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <input
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            type="password"
            placeholder="SYNC_SECRET"
            className="h-10 rounded-md border border-line px-3 text-sm"
          />
          {(["revenuecat", "windsor", "all"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => runSync(kind)}
              disabled={!secret || syncing !== null}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-muted"
            >
              <RefreshCw className={classNames("h-4 w-4", syncing === kind && "animate-spin")} />
              Sync {kind === "all" ? "All" : kind === "revenuecat" ? "RevenueCat" : "Windsor"}
            </button>
          ))}
        </div>
        {message && <p className="mt-3 text-sm text-muted">{message}</p>}
      </section>

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState label="No sync runs yet" />
      ) : (
        <div className="overflow-hidden rounded-md border border-line bg-white shadow-soft">
          <div className="overflow-auto">
            <table className="min-w-[860px] w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[#edf3ff] text-xs uppercase text-muted">
                <tr>
                  {["Source", "Started", "Finished", "Status", "Rows Synced", "Error"].map((heading) => (
                    <th key={heading} className="border-b border-line px-3 py-3 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.source}-${row.syncStartedAt}`} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-3 py-3 font-medium">{row.source}</td>
                    <td className="whitespace-nowrap px-3 py-3">{new Date(row.syncStartedAt).toLocaleString("en-IN")}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.syncFinishedAt ? new Date(row.syncFinishedAt).toLocaleString("en-IN") : "Running"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{row.status ?? "NA"}</td>
                    <td className="whitespace-nowrap px-3 py-3">{row.rowsSynced}</td>
                    <td className="min-w-72 px-3 py-3 text-loss">{row.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardApp() {
  const [activeTab, setActiveTab] = useState<Tab>("Executive Dashboard");
  const [filters, setFilters] = useState({
    dateFrom: currentYearStart(),
    dateTo: today(),
    app: "all",
    pnl: "all",
    search: ""
  });
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [dailyRows, setDailyRows] = useState<DailyPnlRow[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<MonthlySummaryRow[]>([]);
  const [campaignRows, setCampaignRows] = useState<CampaignAnalysisRow[]>([]);
  const [syncRows, setSyncRows] = useState<SyncStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => buildQuery(filters), [filters]);

  async function refreshData() {
    setLoading(true);
    setError(null);
    try {
      const data = await loadDashboardData(query);
      setSummary(data.summaryData);
      setDailyRows(data.dailyRows);
      setMonthlyRows(data.monthlyRows);
      setCampaignRows(data.campaignRows);
      setSyncRows(data.syncRows);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await loadDashboardData(query);
        if (cancelled) {
          return;
        }

        setSummary(data.summaryData);
        setDailyRows(data.dailyRows);
        setMonthlyRows(data.monthlyRows);
        setCampaignRows(data.campaignRows);
        setSyncRows(data.syncRows);
        setError(null);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <main className="mx-auto min-h-screen max-w-[1800px] px-4 py-5 md:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-brand">CountryBean CMO</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal text-ink">Daily App P&L</h1>
          <p className="mt-2 text-sm text-muted">RevenueCat revenue and Windsor.ai spend, normalized to INR.</p>
        </div>
        <button
          type="button"
          onClick={refreshData}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-ink shadow-soft"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      <nav className="mb-0 flex gap-2 overflow-x-auto rounded-t-md border border-b-0 border-line bg-white p-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={classNames(
              "h-10 shrink-0 rounded-md px-4 text-sm font-semibold",
              activeTab === tab ? "bg-brand text-white" : "text-muted hover:bg-[#edf3ff] hover:text-ink"
            )}
          >
            {tab}
          </button>
        ))}
      </nav>

      <Filters filters={filters} setFilters={setFilters} />

      {error && (
        <div className="mt-4 rounded-md border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error}
        </div>
      )}

      <section className="mt-5">
        {activeTab === "Executive Dashboard" && <ExecutiveDashboard summary={summary} loading={loading} />}
        {activeTab === "Daily P&L" && <DailyPnlTable rows={dailyRows} loading={loading} />}
        {activeTab === "App Summary" && (
          <AppSummaryTable rows={summary?.appSummary ?? []} loading={loading} />
        )}
        {activeTab === "Monthly Summary" && <MonthlyTable rows={monthlyRows} loading={loading} />}
        {activeTab === "Campaign Analysis" && <CampaignTable rows={campaignRows} loading={loading} />}
        {activeTab === "Sync Health" && (
          <SyncHealth rows={syncRows} loading={loading} onRefresh={refreshData} />
        )}
      </section>
    </main>
  );
}
