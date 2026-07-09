import { toFiniteNumber } from "@/lib/sync/money";

const DATE_KEYS = new Set(["date", "start_date", "end_date", "timestamp", "period"]);
const MEASURE_KEYS = ["id", "key", "name", "display_name", "label", "title"];

function normalizeDateToken(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function isNumericCandidate(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return false;
  }

  return Number.isFinite(Number(value));
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function measureText(measure: Record<string, unknown>): string {
  return MEASURE_KEYS.map((key) => measure[key])
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map(String)
    .join(" ");
}

function getPreferredMeasureValueIndex(payload: unknown, preferredKeys: string[]): number | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const measures = (payload as { measures?: unknown }).measures;
  if (!Array.isArray(measures)) {
    return null;
  }

  const normalizedKeys = preferredKeys.map(normalizeSearchText);
  const measureIndex = measures.findIndex((measure) => {
    if (!measure || typeof measure !== "object") {
      return false;
    }

    const text = normalizeSearchText(measureText(measure as Record<string, unknown>));
    return normalizedKeys.some((key) => text.includes(key));
  });

  return measureIndex >= 0 ? measureIndex + 1 : null;
}

function pickNumericValue(
  point: unknown,
  preferredKeys: string[],
  preferredMeasureValueIndex: number | null
): number {
  if (Array.isArray(point)) {
    if (
      preferredMeasureValueIndex !== null &&
      isNumericCandidate(point[preferredMeasureValueIndex])
    ) {
      return toFiniteNumber(point[preferredMeasureValueIndex]);
    }

    const numeric = point.slice(1).find(isNumericCandidate);
    return toFiniteNumber(numeric);
  }

  if (point && typeof point === "object") {
    const record = point as Record<string, unknown>;
    for (const key of preferredKeys) {
      if (key in record && isNumericCandidate(record[key])) {
        return toFiniteNumber(record[key]);
      }
    }

    const fallback = Object.entries(record).find(
      ([key, value]) => !DATE_KEYS.has(key) && isNumericCandidate(value)
    );
    return toFiniteNumber(fallback?.[1]);
  }

  return 0;
}

function pickDate(point: unknown): string | null {
  if (Array.isArray(point)) {
    return normalizeDateToken(point[0]);
  }

  if (point && typeof point === "object") {
    const record = point as Record<string, unknown>;
    return (
      normalizeDateToken(record.date) ??
      normalizeDateToken(record.start_date) ??
      normalizeDateToken(record.timestamp) ??
      normalizeDateToken(record.period)
    );
  }

  return null;
}

export function extractRevenueCatDailySeries(
  payload: unknown,
  preferredKeys: string[] = ["value", "amount", "revenue", "proceeds", "count"]
): Map<string, number> {
  const values = payload && typeof payload === "object" ? (payload as { values?: unknown }).values : undefined;
  const sourceValues = Array.isArray(values) ? values : [];
  const preferredMeasureValueIndex = getPreferredMeasureValueIndex(payload, preferredKeys);
  const series = new Map<string, number>();

  for (const point of sourceValues) {
    const date = pickDate(point);
    if (!date) {
      continue;
    }

    series.set(date, pickNumericValue(point, preferredKeys, preferredMeasureValueIndex));
  }

  return series;
}
