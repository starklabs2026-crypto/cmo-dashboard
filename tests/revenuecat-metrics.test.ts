import { describe, expect, it, vi } from "vitest";
import {
  assertUniqueResolvedRevenueCatProjects,
  fetchRevenueMetricSeries,
  getDefaultRevenueCatMetricDateRange
} from "@/lib/sync/revenuecat-metrics";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("RevenueCat metrics revenue helper", () => {
  it("builds one metrics/revenue request per date with USD proceeds", async () => {
    const requestedUrls: string[] = [];
    const values = [12.5, 0, 7.75];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrls.push(String(input));
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer sk_test",
        Accept: "application/json"
      });
      return jsonResponse({ value: values[requestedUrls.length - 1] });
    });

    const series = await fetchRevenueMetricSeries(
      "proj_test",
      "sk_test",
      "2026-07-08",
      "2026-07-10",
      fetcher as typeof fetch
    );

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(series).toEqual(
      new Map([
        ["2026-07-08", 12.5],
        ["2026-07-09", 0],
        ["2026-07-10", 7.75]
      ])
    );

    for (const [index, date] of ["2026-07-08", "2026-07-09", "2026-07-10"].entries()) {
      const url = new URL(requestedUrls[index]);
      expect(url.origin).toBe("https://api.revenuecat.com");
      expect(url.pathname).toBe("/v2/projects/proj_test/metrics/revenue");
      expect(url.searchParams.get("start_date")).toBe(date);
      expect(url.searchParams.get("end_date")).toBe(date);
      expect(url.searchParams.get("currency")).toBe("USD");
      expect(url.searchParams.get("revenue_type")).toBe("proceeds");
    }
  });

  it("treats null and non-numeric metric values as zero", async () => {
    const payloads = [{ value: null }, { value: "not-a-number" }];
    const fetcher = vi.fn(async () => jsonResponse(payloads.shift()));

    const series = await fetchRevenueMetricSeries(
      "proj_test",
      "sk_test",
      "2026-07-09",
      "2026-07-10",
      fetcher as typeof fetch
    );

    expect(series).toEqual(
      new Map([
        ["2026-07-09", 0],
        ["2026-07-10", 0]
      ])
    );
  });

  it("rejects date ranges longer than twenty-five inclusive days", async () => {
    const fetcher = vi.fn();

    await expect(
      fetchRevenueMetricSeries(
        "proj_test",
        "sk_test",
        "2026-07-01",
        "2026-07-26",
        fetcher as typeof fetch
      )
    ).rejects.toThrow("RevenueCat metrics/revenue backfills must be chunked to at most 25 inclusive days.");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("RevenueCat metric date range", () => {
  it("defaults to the last fourteen UTC days inclusive", () => {
    expect(getDefaultRevenueCatMetricDateRange(new Date("2026-07-09T10:30:00.000Z"))).toEqual({
      dateFrom: "2026-06-26",
      dateTo: "2026-07-09"
    });
  });
});

describe("RevenueCat resolved project guard", () => {
  it("rejects two active apps that resolve to the same project id", () => {
    expect(() =>
      assertUniqueResolvedRevenueCatProjects([
        { appName: "Cado", projectId: "proj_same" },
        { appName: "Medzy", projectId: "proj_same" }
      ])
    ).toThrow(
      "RevenueCat metrics/revenue is project-total only, so each active apps.revenuecat_project_id must map to exactly one dashboard app. Cado and Medzy both resolved to proj_same."
    );
  });

  it("allows active apps that resolve to unique project ids", () => {
    expect(() =>
      assertUniqueResolvedRevenueCatProjects([
        { appName: "Cado", projectId: "proj_cado" },
        { appName: "Medzy", projectId: "proj_medzy" }
      ])
    ).not.toThrow();
  });
});
