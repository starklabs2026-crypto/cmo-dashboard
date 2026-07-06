import { describe, expect, it } from "vitest";
import { DEFAULT_APP_MAPPINGS, mapWindsorRowToAppName } from "@/lib/sync/app-mapping";

describe("Windsor app mapping", () => {
  it("maps known Windsor app names to dashboard app names", () => {
    expect(mapWindsorRowToAppName({ app: "Cado-AI Calorie Tracker" }, DEFAULT_APP_MAPPINGS)).toBe("Cado");
    expect(mapWindsorRowToAppName({ app: "CryLens" }, DEFAULT_APP_MAPPINGS)).toBe("Crylens");
    expect(mapWindsorRowToAppName({ app: "Clara: AI Skin analyser" }, DEFAULT_APP_MAPPINGS)).toBe("Rate My Skin");
  });

  it("falls back to campaign, ad group, and keyword aliases when app is missing", () => {
    expect(mapWindsorRowToAppName({ campaign: "US EatWise scale test" }, DEFAULT_APP_MAPPINGS)).toBe("Cado");
    expect(mapWindsorRowToAppName({ ad_group_name: "Clara skin broad" }, DEFAULT_APP_MAPPINGS)).toBe("Rate My Skin");
    expect(mapWindsorRowToAppName({ keyword: "medzy glp1 tracker" }, DEFAULT_APP_MAPPINGS)).toBe("Medzy");
  });

  it("returns null when the row cannot be mapped without guessing", () => {
    expect(mapWindsorRowToAppName({ campaign: "generic brand campaign" }, DEFAULT_APP_MAPPINGS)).toBeNull();
  });
});
