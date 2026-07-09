import { describe, expect, it } from "vitest";
import { aggregateWindsorAdSpendRows } from "@/lib/sync/windsor-rows";

describe("Windsor ad spend row aggregation", () => {
  it("sums duplicate rows that share the Supabase conflict key", () => {
    const rows = aggregateWindsorAdSpendRows([
      {
        date: "2026-07-09",
        app_id: "app-1",
        source: "apple_search_ads",
        medium: "paid",
        campaign: "Brand",
        campaign_id: "campaign-1",
        ad_group: null,
        ad_group_id: null,
        keyword: null,
        country: "US",
        spend_inr: 100,
        impressions: 10,
        clicks: 2,
        installs: 1,
        conversions: 0,
        source_last_updated_at: "2026-07-09T01:00:00.000Z"
      },
      {
        date: "2026-07-09",
        app_id: "app-1",
        source: "apple_search_ads",
        medium: "paid",
        campaign: "Brand",
        campaign_id: "campaign-1",
        ad_group: null,
        ad_group_id: null,
        keyword: null,
        country: "US",
        spend_inr: 50,
        impressions: 5,
        clicks: 1,
        installs: 2,
        conversions: 1,
        source_last_updated_at: "2026-07-09T02:00:00.000Z"
      }
    ]);

    expect(rows).toEqual([
      {
        date: "2026-07-09",
        app_id: "app-1",
        source: "apple_search_ads",
        medium: "paid",
        campaign: "Brand",
        campaign_id: "campaign-1",
        ad_group: null,
        ad_group_id: null,
        keyword: null,
        country: "US",
        spend_inr: 150,
        impressions: 15,
        clicks: 3,
        installs: 3,
        conversions: 1,
        source_last_updated_at: "2026-07-09T02:00:00.000Z"
      }
    ]);
  });

  it("keeps rows separate when any conflict dimension differs", () => {
    const rows = aggregateWindsorAdSpendRows([
      {
        date: "2026-07-09",
        app_id: "app-1",
        source: "apple_search_ads",
        medium: "paid",
        campaign: "Brand",
        campaign_id: "campaign-1",
        ad_group: null,
        ad_group_id: null,
        keyword: null,
        country: "US",
        spend_inr: 100,
        impressions: 10,
        clicks: 2,
        installs: 1,
        conversions: 0,
        source_last_updated_at: "2026-07-09T01:00:00.000Z"
      },
      {
        date: "2026-07-09",
        app_id: "app-1",
        source: "apple_search_ads",
        medium: "paid",
        campaign: "Brand",
        campaign_id: "campaign-1",
        ad_group: null,
        ad_group_id: null,
        keyword: null,
        country: "IN",
        spend_inr: 50,
        impressions: 5,
        clicks: 1,
        installs: 2,
        conversions: 1,
        source_last_updated_at: "2026-07-09T02:00:00.000Z"
      }
    ]);

    expect(rows).toHaveLength(2);
  });
});
