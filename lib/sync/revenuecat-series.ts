import { toFiniteNumber } from "@/lib/sync/money";

const DATE_KEYS = new Set(["date", "start_date", "end_date", "timestamp", "period"]);
const MEASURE_KEYS = ["id", "key", "name", "display_name", "label", "title"];
const POINT_MEASURE_KEYS = [
  "measure",
  "measure_id",
  "measure_key",
  "measure_name",
  "metric",
  "metric_id",
  "metric_name",
  "name",
  "display_name",
  "label",
  "title",
  "series",
  "series_name"
];
const NON_VALUE_KEYS = new Set([...DATE_KEYS, ...POINT_MEASURE_KEYS, "object", "category", "unit"]);
const SENSITIVE_KEY_PATTERN = /api[_-]?key|authorization|secret|token/i;
const SENSITIVE_VALUE_PATTERN = /^(sk_|Bearer\s+)/i;

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

function redactSensitiveValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string" && SENSITIVE_VALUE_PATTERN.test(value)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue("", item));
  }

  if (value && typeof value === "object") {
    return redactSensitiveObject(value as Record<string, unknown>);
  }

  return value;
}

function redactSensitiveObject(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, redactSensitiveValue(key, value)])
  );
}

function getRecordValue(record: Record<string, unknown>, key: string): unknown {
  return key in record ? redactSensitiveValue(key, record[key]) : undefined;
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

function getMeasures(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const measures = (payload as { measures?: unknown }).measures;
  return Array.isArray(measures)
    ? measures.filter((measure): measure is Record<string, unknown> => Boolean(measure && typeof measure === "object"))
    : [];
}

function matchesPreferredMeasureText(text: string, preferredKeys: string[]): boolean {
  const normalizedText = normalizeSearchText(text);
  return preferredKeys
    .map(normalizeSearchText)
    .filter(Boolean)
    .some((key) => normalizedText.includes(key));
}

function describeMeasureValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object") {
    return measureText(value as Record<string, unknown>);
  }

  return null;
}

function getArrayMeasureIndexText(point: unknown[], measures: Record<string, unknown>[]): string {
  const indexCandidate = Number(point[1]);
  if (!Number.isInteger(indexCandidate)) {
    return "";
  }

  const candidateMeasures = [measures[indexCandidate], measures[indexCandidate - 1]].filter(
    (measure): measure is Record<string, unknown> => Boolean(measure)
  );

  return candidateMeasures.map(measureText).filter(Boolean).join(" ");
}

function getPointMeasureText(point: unknown, measures: Record<string, unknown>[]): string {
  if (Array.isArray(point)) {
    const labelText = point
      .slice(1)
      .filter((value): value is string => typeof value === "string")
      .filter((value) => !normalizeDateToken(value) && !isNumericCandidate(value))
      .join(" ");

    return labelText || getArrayMeasureIndexText(point, measures);
  }

  if (point && typeof point === "object") {
    const record = point as Record<string, unknown>;
    return POINT_MEASURE_KEYS.map((key) => describeMeasureValue(record[key]))
      .filter((value): value is string => Boolean(value))
      .join(" ");
  }

  return "";
}

function isArrayMeasureIndex(point: unknown[], index: number, measures: Record<string, unknown>[]): boolean {
  if (index !== 1 || measures.length === 0) {
    return false;
  }

  const value = Number(point[index]);
  return Number.isInteger(value) && Boolean(measures[value] || measures[value - 1]);
}

function getPreferredMeasureValueIndex(payload: unknown, preferredKeys: string[]): number | null {
  const measures = getMeasures(payload);
  if (measures.length === 0) {
    return null;
  }

  const normalizedKeys = preferredKeys.map(normalizeSearchText);
  const measureIndex = measures.findIndex((measure) => {
    const text = normalizeSearchText(measureText(measure));
    return normalizedKeys.some((key) => text.includes(key));
  });

  return measureIndex >= 0 ? measureIndex + 1 : null;
}

function pickNumericValue(
  point: unknown,
  preferredKeys: string[],
  preferredMeasureValueIndex: number | null,
  measures: Record<string, unknown>[]
): number {
  if (Array.isArray(point)) {
    if (
      preferredMeasureValueIndex !== null &&
      !isArrayMeasureIndex(point, preferredMeasureValueIndex, measures) &&
      isNumericCandidate(point[preferredMeasureValueIndex])
    ) {
      return toFiniteNumber(point[preferredMeasureValueIndex]);
    }

    const numeric = point
      .slice(1)
      .find((value, index) => !isArrayMeasureIndex(point, index + 1, measures) && isNumericCandidate(value));
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
      ([key, value]) => !NON_VALUE_KEYS.has(key.toLowerCase()) && isNumericCandidate(value)
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
  const measures = getMeasures(payload);
  const preferredMeasureValueIndex = getPreferredMeasureValueIndex(payload, preferredKeys);
  const shouldFilterByPointMeasure = sourceValues.some((point) =>
    matchesPreferredMeasureText(getPointMeasureText(point, measures), preferredKeys)
  );
  const series = new Map<string, number>();

  for (const point of sourceValues) {
    const pointMeasureText = getPointMeasureText(point, measures);
    if (shouldFilterByPointMeasure && !matchesPreferredMeasureText(pointMeasureText, preferredKeys)) {
      continue;
    }

    const date = pickDate(point);
    if (!date) {
      continue;
    }

    const value = pickNumericValue(point, preferredKeys, preferredMeasureValueIndex, measures);
    series.set(date, shouldFilterByPointMeasure ? (series.get(date) ?? 0) + value : value);
  }

  return series;
}

export function hasNonZeroRevenueCatSeries(series: Map<string, number>): boolean {
  return [...series.values()].some((value) => Number.isFinite(value) && value !== 0);
}

export function extractRevenueCatMetricValue(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    return 0;
  }

  const value = (payload as { value?: unknown }).value;
  return isNumericCandidate(value) ? toFiniteNumber(value) : 0;
}

export function describeRevenueCatChartDiagnostics(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return JSON.stringify({ payload_type: typeof payload });
  }

  const record = payload as Record<string, unknown>;
  const values = record.values;
  const diagnostics = {
    object: getRecordValue(record, "object"),
    category: getRecordValue(record, "category"),
    display_name: getRecordValue(record, "display_name"),
    start_date: getRecordValue(record, "start_date"),
    end_date: getRecordValue(record, "end_date"),
    values_count: Array.isArray(values) ? values.length : 0,
    measures: redactSensitiveValue("measures", record.measures),
    summary: redactSensitiveValue("summary", record.summary),
    user_selectors: redactSensitiveValue("user_selectors", record.user_selectors),
    unsupported_params: redactSensitiveValue("unsupported_params", record.unsupported_params)
  };

  return JSON.stringify(diagnostics).slice(0, 1500);
}
