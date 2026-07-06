import { describe, expect, it } from "vitest";
import { convertUsdToInr, toFiniteNumber } from "@/lib/sync/money";

describe("INR conversion", () => {
  it("converts USD values using the configured FX rate", () => {
    expect(convertUsdToInr(10, 95.22)).toBe(952.2);
  });

  it("returns zero for missing or invalid numeric input", () => {
    expect(toFiniteNumber(undefined)).toBe(0);
    expect(toFiniteNumber("")).toBe(0);
    expect(toFiniteNumber("12.34")).toBe(12.34);
  });
});
