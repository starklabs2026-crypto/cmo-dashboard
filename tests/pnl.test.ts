import { describe, expect, it } from "vitest";
import {
  calculateCampaignRecommendation,
  calculatePnlMetrics,
  getDataQualityNote
} from "@/lib/sync/pnl";

describe("P&L formulas", () => {
  it("calculates profit, ROAS, CAC, and payback only from available data", () => {
    const metrics = calculatePnlMetrics({
      netRevenueInr: 12000,
      expectedLtvInr: 24000,
      adSpendInr: 6000,
      otherCostsInr: 1000,
      paidConversions: 12,
      activeSubscriptions: 20
    });

    expect(metrics.profitLossRevenueInr).toBe(5000);
    expect(metrics.profitLossExpectedLtvInr).toBe(17000);
    expect(metrics.revenueRoas).toBe(2);
    expect(metrics.expectedLtvRoas).toBe(4);
    expect(metrics.cac).toBe(500);
    expect(metrics.paybackPeriod).toBeCloseTo(0.8333, 4);
  });

  it("does not calculate CAC, CPI, or payback when denominators are missing or zero", () => {
    const metrics = calculatePnlMetrics({
      netRevenueInr: 0,
      expectedLtvInr: 0,
      adSpendInr: 1000,
      otherCostsInr: 0,
      paidConversions: 0,
      activeSubscriptions: 0,
      installs: 0
    });

    expect(metrics.cac).toBeNull();
    expect(metrics.cpi).toBeNull();
    expect(metrics.paybackPeriod).toBeNull();
  });
});

describe("missing data handling", () => {
  it("reports data quality notes without inventing missing metrics", () => {
    expect(
      getDataQualityNote({
        hasRevenueData: false,
        hasAdSpendData: true,
        paidConversions: 0,
        activeSubscriptions: 0,
        netRevenueInr: 0,
        expectedLtvInr: 0
      })
    ).toContain("RevenueCat data missing");
  });
});

describe("campaign recommendation logic", () => {
  it("pauses campaigns with spend and zero installs", () => {
    expect(
      calculateCampaignRecommendation({
        spendInr: 1000,
        installs: 0,
        cpi: null,
        revenueRoas: null,
        expectedLtvRoas: null
      })
    ).toBe("Pause / investigate");
  });

  it("scales cautiously when CPI is low and expected LTV ROAS is positive", () => {
    expect(
      calculateCampaignRecommendation({
        spendInr: 1000,
        installs: 20,
        cpi: 50,
        revenueRoas: 0.8,
        expectedLtvRoas: 1.6
      })
    ).toBe("Scale carefully");
  });

  it("reduces spend when revenue and expected LTV ROAS are both below one", () => {
    expect(
      calculateCampaignRecommendation({
        spendInr: 1000,
        installs: 10,
        cpi: 100,
        revenueRoas: 0.6,
        expectedLtvRoas: 0.8
      })
    ).toBe("Reduce spend");
  });
});
