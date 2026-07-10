import { afterEach, describe, expect, it, vi } from "vitest";

const { createSupabaseAdminMock } = vi.hoisted(() => ({
  createSupabaseAdminMock: vi.fn()
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: () => createSupabaseAdminMock()
}));

import { runRevenueCatSync } from "@/lib/sync/revenuecat";

const originalEnv = process.env;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function createSupabaseMock() {
  const upserts: Array<{ rows: Record<string, unknown>[]; options: Record<string, unknown> }> = [];

  return {
    upserts,
    client: {
      from: vi.fn((table: string) => {
        if (table === "sync_runs") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "run_1" }, error: null }))
              }))
            })),
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null }))
            }))
          };
        }

        if (table === "apps") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(async () => ({
                  data: [
                    {
                      id: "app_1",
                      app_name: "Cado",
                      revenuecat_project_id: "proj_cado"
                    }
                  ],
                  error: null
                }))
              }))
            }))
          };
        }

        if (table === "daily_revenue") {
          return {
            upsert: vi.fn(async (rows: Record<string, unknown>[], options: Record<string, unknown>) => {
              upserts.push({ rows, options });
              return { error: null };
            })
          };
        }

        throw new Error(`Unexpected table ${table}`);
      })
    }
  };
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("RevenueCat sync", () => {
  it("upserts daily revenue from metrics/revenue without calling the revenue chart", async () => {
    process.env = {
      ...originalEnv,
      REVENUECAT_API_KEY: "sk_test",
      USD_TO_INR: "100"
    };
    const supabase = createSupabaseMock();
    createSupabaseAdminMock.mockReturnValue(supabase.client);
    const requestedUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      requestedUrls.push(url.href);

      if (url.pathname === "/v2/projects/proj_cado/metrics/revenue") {
        return jsonResponse({
          value: url.searchParams.get("start_date") === "2026-07-09" ? 3 : 5
        });
      }

      if (url.pathname === "/v2/projects/proj_cado/charts/refund_rate") {
        return jsonResponse({
          values: [
            { date: "2026-07-09", proceeds: 1 },
            { date: "2026-07-10", proceeds: 2 }
          ]
        });
      }

      if (url.pathname.startsWith("/v2/projects/proj_cado/charts/")) {
        return jsonResponse({ values: [] });
      }

      throw new Error(`Unexpected RevenueCat request ${url.href}`);
    });

    const result = await runRevenueCatSync({
      dateFrom: "2026-07-09",
      dateTo: "2026-07-10",
      fetcher: fetcher as typeof fetch
    });

    expect(result).toMatchObject({
      source: "revenuecat",
      status: "success",
      rowsSynced: 2
    });
    expect(supabase.upserts).toHaveLength(1);
    expect(supabase.upserts[0].options).toEqual({ onConflict: "date,app_id" });
    expect(supabase.upserts[0].rows).toEqual([
      expect.objectContaining({
        date: "2026-07-09",
        app_id: "app_1",
        revenue_inr: 300,
        refunds_inr: 100,
        net_revenue_inr: 200,
        source: "revenuecat"
      }),
      expect.objectContaining({
        date: "2026-07-10",
        app_id: "app_1",
        revenue_inr: 500,
        refunds_inr: 200,
        net_revenue_inr: 300,
        source: "revenuecat"
      })
    ]);
    expect(requestedUrls.filter((url) => url.includes("/metrics/revenue"))).toHaveLength(2);
    expect(requestedUrls.some((url) => url.includes("/charts/revenue"))).toBe(false);
  });
});
