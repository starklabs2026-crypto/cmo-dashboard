import { afterEach, describe, expect, it } from "vitest";
import {
  getRevenueCatApiKeyForApp,
  toRevenueCatEnvSuffix
} from "@/lib/sync/revenuecat-keys";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("RevenueCat API key selection", () => {
  it("uses app-specific secret env vars before the shared fallback key", () => {
    process.env = {
      ...originalEnv,
      REVENUECAT_API_KEY: "sk_shared",
      REVENUECAT_API_KEY_CADO: "sk_cado"
    };

    expect(getRevenueCatApiKeyForApp("Cado", "proj_cado")).toBe("sk_cado");
  });

  it("uses project-specific secret env vars when app-specific vars are absent", () => {
    process.env = {
      ...originalEnv,
      REVENUECAT_API_KEY_PROJ_MEDZY: "sk_medzy"
    };

    expect(getRevenueCatApiKeyForApp("Medzy", "proj_medzy")).toBe("sk_medzy");
  });

  it("uses JSON mappings keyed by app name or project identifier", () => {
    process.env = {
      ...originalEnv,
      REVENUECAT_API_KEYS: JSON.stringify({
        "Rate My Skin": "sk_skin",
        "proj_fernly": "sk_fernly"
      })
    };

    expect(getRevenueCatApiKeyForApp("Rate My Skin", "proj_skin")).toBe("sk_skin");
    expect(getRevenueCatApiKeyForApp("Fernly", "proj_fernly")).toBe("sk_fernly");
  });

  it("normalizes names into valid env var suffixes", () => {
    expect(toRevenueCatEnvSuffix("Rate My Skin")).toBe("RATE_MY_SKIN");
    expect(toRevenueCatEnvSuffix("Medzy : GLP-1 Tracker")).toBe("MEDZY_GLP_1_TRACKER");
  });
});
