import { describe, expect, it } from "vitest";
import {
  describeRevenueCatChartDiagnostics,
  extractRevenueCatDailySeries,
  extractRevenueCatMetricValue,
  hasNonZeroRevenueCatSeries
} from "@/lib/sync/revenuecat-series";

describe("RevenueCat chart series extraction", () => {
  it("uses matching chart measures for array values", () => {
    const series = extractRevenueCatDailySeries(
      {
        measures: [
          { id: "revenue", display_name: "Gross revenue" },
          { id: "proceeds", display_name: "Proceeds" },
          { id: "count", display_name: "Transactions" }
        ],
        values: [["2026-07-09", null, 12.5, 4]]
      },
      ["proceeds", "revenue"]
    );

    expect(series.get("2026-07-09")).toBe(12.5);
  });

  it("does not treat null-like array values as numeric zero before later values", () => {
    const series = extractRevenueCatDailySeries({
      values: [["2026-07-09", null, "", 8.25]]
    });

    expect(series.get("2026-07-09")).toBe(8.25);
  });

  it("keeps the preferred measure from flattened object chart values", () => {
    const series = extractRevenueCatDailySeries(
      {
        values: [
          { date: "2026-07-09", display_name: "Proceeds", value: 12.5 },
          { date: "2026-07-09", display_name: "Transactions", value: 3 },
          { date: "2026-07-09", display_name: "Ad Impressions", value: 0 }
        ]
      },
      ["proceeds", "revenue"]
    );

    expect(series.get("2026-07-09")).toBe(12.5);
  });

  it("keeps the preferred measure from flattened array chart values", () => {
    const series = extractRevenueCatDailySeries(
      {
        values: [
          ["2026-07-09", "Proceeds", 12.5],
          ["2026-07-09", "Transactions", 3],
          ["2026-07-09", "Ad Impressions", 0]
        ]
      },
      ["proceeds", "revenue"]
    );

    expect(series.get("2026-07-09")).toBe(12.5);
  });

  it("keeps the preferred zero-based measure from indexed chart values", () => {
    const series = extractRevenueCatDailySeries(
      {
        start_date: 1768003200,
        end_date: 1768176000,
        measures: [
          { display_name: "Proceeds" },
          { display_name: "Transactions" },
          { display_name: "Ad Impressions" }
        ],
        values: [
          [0, 1768003200, 12.5],
          [1, 1768003200, 3],
          [2, 1768003200, 0],
          [0, 1768089600, 7.75],
          [1, 1768089600, 2],
          [2, 1768089600, 0]
        ]
      },
      ["proceeds", "revenue"]
    );

    expect(series.get("2026-01-10")).toBe(12.5);
    expect(series.get("2026-01-11")).toBe(7.75);
  });

  it("keeps the preferred measure when the timestamp and measure index are not in fixed positions", () => {
    const series = extractRevenueCatDailySeries(
      {
        start_date: 1768003200,
        end_date: 1768176000,
        measures: [
          { display_name: "Proceeds" },
          { display_name: "Transactions" },
          { display_name: "Ad Impressions" }
        ],
        values: [
          [1768003200, 12.5, 0],
          [1768003200, 3, 1],
          [1768003200, 0, 2]
        ]
      },
      ["proceeds", "revenue"]
    );

    expect(series.get("2026-01-10")).toBe(12.5);
  });

  it("keeps the preferred one-based measure from indexed chart values", () => {
    const series = extractRevenueCatDailySeries(
      {
        start_date: 1768003200,
        end_date: 1768176000,
        measures: [
          { display_name: "Proceeds" },
          { display_name: "Transactions" },
          { display_name: "Ad Impressions" }
        ],
        values: [
          [1, 1768003200, 12.5],
          [2, 1768003200, 3],
          [3, 1768003200, 0]
        ]
      },
      ["proceeds", "revenue"]
    );

    expect(series.get("2026-01-10")).toBe(12.5);
  });

  it("detects whether a chart series has non-zero values", () => {
    expect(hasNonZeroRevenueCatSeries(new Map([["2026-07-09", 0]]))).toBe(false);
    expect(hasNonZeroRevenueCatSeries(new Map([["2026-07-09", 2.5]]))).toBe(true);
  });

  it("extracts revenue metric totals", () => {
    expect(extractRevenueCatMetricValue({ value: 123.45 })).toBe(123.45);
    expect(extractRevenueCatMetricValue({ value: null })).toBe(0);
  });

  it("describes chart diagnostics without leaking secrets", () => {
    const diagnostics = describeRevenueCatChartDiagnostics({
      display_name: "Revenue",
      values: [],
      measures: [{ id: "revenue", display_name: "Revenue" }],
      summary: { value: 0 },
      user_selectors: { revenue_type: "proceeds", api_key: "sk_test_secret" },
      unsupported_params: { selectors: ["revenue_type"] }
    });

    expect(diagnostics).toContain('"values_count":0');
    expect(diagnostics).toContain('"revenue_type":"proceeds"');
    expect(diagnostics).toContain('"api_key":"[redacted]"');
    expect(diagnostics).not.toContain("sk_test_secret");
  });

  it("describes indexed chart value structure without dumping raw values", () => {
    const diagnostics = describeRevenueCatChartDiagnostics(
      {
        start_date: 1768003200,
        end_date: 1768176000,
        measures: [
          { display_name: "Proceeds" },
          { display_name: "Transactions" },
          { display_name: "Ad Impressions" }
        ],
        values: [
          [0, 1768003200, 12.5],
          [1, 1768003200, 3],
          [2, 1768003200, 0]
        ]
      },
      ["proceeds", "revenue"]
    );

    expect(diagnostics).toContain('"array_lengths":[3]');
    expect(diagnostics).toContain('"date_index":1');
    expect(diagnostics).toContain('"measure_index":0');
    expect(diagnostics).toContain('"value_index":2');
    expect(diagnostics).toContain('"matched_measure":"Proceeds"');
    expect(diagnostics).not.toContain("[0,1768003200,12.5]");
  });
});
