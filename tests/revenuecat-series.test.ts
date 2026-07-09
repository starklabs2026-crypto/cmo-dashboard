import { describe, expect, it } from "vitest";
import { extractRevenueCatDailySeries } from "@/lib/sync/revenuecat-series";

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
});
