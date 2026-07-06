export type DashboardAppName =
  | "Cado"
  | "Dishit"
  | "Medzy"
  | "Crylens"
  | "Fernly"
  | "Rate My Skin";

export type AppMapping = {
  appName: DashboardAppName;
  revenueCatProjectNames: string[];
  windsorAppNames: string[];
  campaignAliases: string[];
};

export type WindsorMappingRow = {
  app?: string | null;
  campaign?: string | null;
  campaign_id?: string | null;
  ad_group?: string | null;
  ad_group_name?: string | null;
  keyword?: string | null;
};

export const DEFAULT_APP_MAPPINGS: AppMapping[] = [
  {
    appName: "Cado",
    revenueCatProjectNames: ["Cado"],
    windsorAppNames: ["Cado", "Cado-AI Calorie Tracker"],
    campaignAliases: ["cado", "eatwise"]
  },
  {
    appName: "Dishit",
    revenueCatProjectNames: ["Dishit"],
    windsorAppNames: ["Dishit"],
    campaignAliases: ["dishit"]
  },
  {
    appName: "Medzy",
    revenueCatProjectNames: ["Medzy : GLP-1 Tracker", "Medzy"],
    windsorAppNames: ["Medzy", "Medzy : GLP-1 Tracker", "Medzy GLP-1 Tracker"],
    campaignAliases: ["medzy"]
  },
  {
    appName: "Crylens",
    revenueCatProjectNames: ["Crylens"],
    windsorAppNames: ["Crylens", "CryLens"],
    campaignAliases: ["crylens"]
  },
  {
    appName: "Fernly",
    revenueCatProjectNames: ["Fernly"],
    windsorAppNames: ["Fernly"],
    campaignAliases: ["fernly"]
  },
  {
    appName: "Rate My Skin",
    revenueCatProjectNames: ["Rate My Skin"],
    windsorAppNames: ["Rate My Skin", "Clara: AI Skin analyser", "Clara AI Skin analyser"],
    campaignAliases: ["clara", "skin", "rate my skin"]
  }
];

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasAlias(value: string, aliases: string[]): boolean {
  const normalizedValue = normalizeText(value);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    return normalizedAlias.length > 0 && normalizedValue.includes(normalizedAlias);
  });
}

export function mapWindsorRowToAppName(
  row: WindsorMappingRow,
  mappings: AppMapping[] = DEFAULT_APP_MAPPINGS
): DashboardAppName | null {
  const normalizedApp = normalizeText(row.app);
  if (normalizedApp) {
    const directMatch = mappings.find((mapping) =>
      mapping.windsorAppNames.some((name) => normalizeText(name) === normalizedApp)
    );

    if (directMatch) {
      return directMatch.appName;
    }
  }

  const fallbackText = [
    row.campaign,
    row.campaign_id,
    row.ad_group,
    row.ad_group_name,
    row.keyword
  ]
    .filter(Boolean)
    .join(" ");

  if (!fallbackText.trim()) {
    return null;
  }

  const aliasMatch = mappings.find((mapping) => hasAlias(fallbackText, mapping.campaignAliases));
  return aliasMatch?.appName ?? null;
}

export function getDefaultMappingForApp(appName: string): AppMapping | undefined {
  const normalizedApp = normalizeText(appName);
  return DEFAULT_APP_MAPPINGS.find((mapping) => normalizeText(mapping.appName) === normalizedApp);
}
