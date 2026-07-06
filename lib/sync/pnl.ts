import { roundCurrency } from "@/lib/sync/money";

export type PnlInput = {
  netRevenueInr: number;
  expectedLtvInr: number;
  adSpendInr: number;
  otherCostsInr: number;
  paidConversions?: number | null;
  activeSubscriptions?: number | null;
  installs?: number | null;
};

export type PnlMetrics = {
  profitLossRevenueInr: number;
  profitLossExpectedLtvInr: number;
  revenueRoas: number | null;
  expectedLtvRoas: number | null;
  cac: number | null;
  cpi: number | null;
  averageDailyRevenuePerCustomer: number | null;
  paybackPeriod: number | null;
};

type DataQualityInput = {
  hasRevenueData?: boolean;
  hasAdSpendData?: boolean;
  paidConversions?: number | null;
  activeSubscriptions?: number | null;
  netRevenueInr?: number | null;
  expectedLtvInr?: number | null;
};

export type CampaignRecommendationInput = {
  spendInr: number;
  installs?: number | null;
  cpi?: number | null;
  revenueRoas?: number | null;
  expectedLtvRoas?: number | null;
};

function roundMetric(value: number, precision = 4): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function safeRatio(numerator: number, denominator?: number | null, precision = 4): number | null {
  if (denominator === null || denominator === undefined || denominator === 0) {
    return null;
  }

  return roundMetric(numerator / denominator, precision);
}

export function calculatePnlMetrics(input: PnlInput): PnlMetrics {
  const profitLossRevenueInr = roundCurrency(
    input.netRevenueInr - input.adSpendInr - input.otherCostsInr
  );
  const profitLossExpectedLtvInr = roundCurrency(
    input.expectedLtvInr - input.adSpendInr - input.otherCostsInr
  );
  const revenueRoas = safeRatio(input.netRevenueInr, input.adSpendInr);
  const expectedLtvRoas = safeRatio(input.expectedLtvInr, input.adSpendInr);
  const cac = safeRatio(input.adSpendInr, input.paidConversions, 2);
  const cpi = safeRatio(input.adSpendInr, input.installs, 2);
  const averageDailyRevenuePerCustomer = safeRatio(input.netRevenueInr, input.activeSubscriptions, 2);
  const paybackPeriod =
    cac !== null && averageDailyRevenuePerCustomer !== null && averageDailyRevenuePerCustomer > 0
      ? roundMetric(cac / averageDailyRevenuePerCustomer, 4)
      : null;

  return {
    profitLossRevenueInr,
    profitLossExpectedLtvInr,
    revenueRoas,
    expectedLtvRoas,
    cac,
    cpi,
    averageDailyRevenuePerCustomer,
    paybackPeriod
  };
}

export function getDataQualityNote(input: DataQualityInput): string {
  const notes: string[] = [];

  if (input.hasRevenueData === false) {
    notes.push("RevenueCat data missing");
  }

  if (input.hasAdSpendData === false) {
    notes.push("Windsor spend data missing");
  }

  if (!input.paidConversions || input.paidConversions <= 0) {
    notes.push("CAC unavailable");
  }

  if (
    !input.activeSubscriptions ||
    input.activeSubscriptions <= 0 ||
    !input.netRevenueInr ||
    input.netRevenueInr <= 0
  ) {
    notes.push("Payback unavailable");
  }

  if (!input.expectedLtvInr || input.expectedLtvInr <= 0) {
    notes.push("Expected LTV missing");
  }

  return notes.length > 0 ? notes.join("; ") : "Complete";
}

export function calculateCampaignRecommendation(input: CampaignRecommendationInput): string {
  const installs = input.installs ?? null;
  const cpi = input.cpi ?? null;
  const revenueRoas = input.revenueRoas ?? null;
  const expectedLtvRoas = input.expectedLtvRoas ?? null;

  if (input.spendInr > 0 && installs === 0) {
    return "Pause / investigate";
  }

  if (input.spendInr <= 0 || installs === null || cpi === null) {
    return "Insufficient data";
  }

  if (cpi <= 100 && expectedLtvRoas !== null && expectedLtvRoas >= 1) {
    return "Scale carefully";
  }

  if (
    revenueRoas !== null &&
    expectedLtvRoas !== null &&
    revenueRoas < 1 &&
    expectedLtvRoas < 1
  ) {
    return "Reduce spend";
  }

  if (revenueRoas === null || expectedLtvRoas === null) {
    return "Insufficient data";
  }

  return "Monitor";
}
