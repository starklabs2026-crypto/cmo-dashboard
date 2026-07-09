export type WindsorAdSpendRow = {
  date: string;
  app_id: string;
  source: string;
  medium: string;
  campaign: string | null;
  campaign_id: string | null;
  ad_group: string | null;
  ad_group_id: string | null;
  keyword: string | null;
  country: string | null;
  spend_inr: number;
  impressions: number;
  clicks: number;
  installs: number;
  conversions: number;
  source_last_updated_at: string;
};

const WINDSOR_AD_SPEND_CONFLICT_FIELDS = [
  "date",
  "app_id",
  "source",
  "medium",
  "campaign",
  "campaign_id",
  "ad_group",
  "ad_group_id",
  "keyword",
  "country"
] as const satisfies readonly (keyof WindsorAdSpendRow)[];

function getConflictKey(row: WindsorAdSpendRow): string {
  return JSON.stringify(WINDSOR_AD_SPEND_CONFLICT_FIELDS.map((field) => row[field] ?? null));
}

export function aggregateWindsorAdSpendRows(rows: WindsorAdSpendRow[]): WindsorAdSpendRow[] {
  const rowByConflictKey = new Map<string, WindsorAdSpendRow>();

  for (const row of rows) {
    const key = getConflictKey(row);
    const existing = rowByConflictKey.get(key);

    if (!existing) {
      rowByConflictKey.set(key, { ...row });
      continue;
    }

    existing.spend_inr += row.spend_inr;
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    existing.installs += row.installs;
    existing.conversions += row.conversions;

    if (row.source_last_updated_at > existing.source_last_updated_at) {
      existing.source_last_updated_at = row.source_last_updated_at;
    }
  }

  return [...rowByConflictKey.values()];
}
