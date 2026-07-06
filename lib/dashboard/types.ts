export type DailyPnlRow = {
  date: string;
  appName: string;
  revenueInr: number;
  expectedLtvInr: number;
  adSpendInr: number;
  otherCostsInr: number;
  netRevenueInr: number;
  profitLossRevenueInr: number;
  profitLossExpectedLtvInr: number;
  revenueRoas: number | null;
  expectedLtvRoas: number | null;
  cac: number | null;
  paybackPeriod: number | null;
  trials: number;
  paidConversions: number;
  activeSubscriptions: number;
  cancellations: number;
  hasRevenueData: boolean;
  hasAdSpendData: boolean;
  dataQualityNote: string;
};

export type SummaryKpis = {
  ytdRevenueInr: number;
  ytdExpectedLtvInr: number;
  ytdAdSpendInr: number;
  profitLossRevenueInr: number;
  profitLossExpectedLtvInr: number;
  revenueRoas: number | null;
  expectedLtvRoas: number | null;
  bestPerformingApp: string | null;
  worstPerformingApp: string | null;
};

export type AppSummaryRow = {
  appName: string;
  revenueInr: number;
  expectedLtvInr: number;
  adSpendInr: number;
  otherCostsInr: number;
  netRevenueInr: number;
  profitLossRevenueInr: number;
  profitLossExpectedLtvInr: number;
  revenueRoas: number | null;
  expectedLtvRoas: number | null;
  cac: number | null;
  paybackPeriod: number | null;
  trials: number;
  paidConversions: number;
  activeSubscriptions: number;
  cancellations: number;
};

export type MonthlySummaryRow = {
  month: string;
  appName: string;
  monthlyRevenueInr: number;
  monthlyExpectedLtvInr: number;
  monthlyAdSpendInr: number;
  monthlyProfitLossRevenueInr: number;
  monthlyProfitLossExpectedLtvInr: number;
  monthlyRoas: number | null;
  momGrowthPercent: number | null;
};

export type CampaignAnalysisRow = {
  appName: string;
  source: string;
  campaign: string;
  adGroup: string;
  keyword: string;
  spendInr: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  installs: number;
  cpi: number | null;
  recommendation: string;
};

export type SyncStatusRow = {
  source: string;
  syncStartedAt: string;
  syncFinishedAt: string | null;
  status: string | null;
  rowsSynced: number;
  errorMessage: string | null;
};
