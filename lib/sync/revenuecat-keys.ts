function getConfiguredEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function toRevenueCatEnvSuffix(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function getMappedRevenueCatApiKey(appName: string, projectIdentifier: string): string | undefined {
  const rawMapping = getConfiguredEnv("REVENUECAT_API_KEYS");
  if (!rawMapping) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMapping);
  } catch {
    throw new Error("REVENUECAT_API_KEYS must be a JSON object keyed by app name or RevenueCat project id.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("REVENUECAT_API_KEYS must be a JSON object keyed by app name or RevenueCat project id.");
  }

  const mapping = parsed as Record<string, unknown>;
  const directValue = mapping[appName] ?? mapping[projectIdentifier];
  if (typeof directValue === "string" && directValue.trim().length > 0) {
    return directValue.trim();
  }

  const wantedKeys = new Set([
    appName.toLowerCase(),
    projectIdentifier.toLowerCase(),
    toRevenueCatEnvSuffix(appName),
    toRevenueCatEnvSuffix(projectIdentifier)
  ]);

  for (const [key, value] of Object.entries(mapping)) {
    if (
      typeof value === "string" &&
      value.trim().length > 0 &&
      (wantedKeys.has(key.toLowerCase()) || wantedKeys.has(toRevenueCatEnvSuffix(key)))
    ) {
      return value.trim();
    }
  }

  return undefined;
}

export function getRevenueCatApiKeyForApp(appName: string, projectIdentifier: string): string {
  const appSpecificEnv = `REVENUECAT_API_KEY_${toRevenueCatEnvSuffix(appName)}`;
  const projectSpecificEnv = `REVENUECAT_API_KEY_${toRevenueCatEnvSuffix(projectIdentifier)}`;
  const specificKey = getConfiguredEnv(appSpecificEnv) ?? getConfiguredEnv(projectSpecificEnv);
  if (specificKey) {
    return specificKey;
  }

  const mappedKey = getMappedRevenueCatApiKey(appName, projectIdentifier);
  if (mappedKey) {
    return mappedKey;
  }

  const fallbackKey = getConfiguredEnv("REVENUECAT_API_KEY");
  if (fallbackKey) {
    return fallbackKey;
  }

  throw new Error(
    `RevenueCat API key is required for ${appName}. Set ${appSpecificEnv}, ${projectSpecificEnv}, REVENUECAT_API_KEYS, or REVENUECAT_API_KEY.`
  );
}
