import { describe, expect, it } from "vitest";
import { enumerateDates, getDefaultSyncDateRange } from "@/lib/sync/dates";

describe("sync date ranges", () => {
  it("defaults to a rolling six-month inclusive window", () => {
    expect(getDefaultSyncDateRange(6, new Date("2026-07-09T10:30:00.000Z"))).toEqual({
      dateFrom: "2026-01-10",
      dateTo: "2026-07-09"
    });
  });

  it("enumerates every date in a range inclusively", () => {
    expect(enumerateDates("2026-07-07", "2026-07-09")).toEqual([
      "2026-07-07",
      "2026-07-08",
      "2026-07-09"
    ]);
  });
});
