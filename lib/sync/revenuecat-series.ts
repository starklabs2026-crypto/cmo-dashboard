import { toFiniteNumber } from "@/lib/sync/money";

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEYS = new Set([
  "date",
  "start_date",
  "end_date",
  "timestamp",
  "time",
  "start_time",
  "period",
  "period_start",
  "period_end",
  "x"
]);
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

type DateBounds = {
  startMs: number | null;
  endMs: number | null;
};

type PickedDate = {
  date: string | null;
  index: number | null;
};

type MeasureBase = 0 | 1;

type ArrayMeasureSpec = {
  position: number;
  base: MeasureBase;
  preferredMeasureIndex: number | null;
  matchedMeasure: string | null;
};

type FlatPrimitiveLayout = "date-major" | "measure-major";

type PreferredMeasureMatch = {
  index: number;
  matchedMeasure: string;
  summaryTotal: number | null;
};

type FlatPrimitiveCandidate = {
  layout: FlatPrimitiveLayout;
  values: number[];
  sum: number;
  difference: number | null;
};

type FlatPrimitiveAnalysis = {
  dates: string[];
  measureCount: number;
  lengthMatches: boolean;
  measure: PreferredMeasureMatch | null;
  candidates: FlatPrimitiveCandidate[];
  selected: FlatPrimitiveCandidate | null;
};

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

function dateTokenToMs(date: string | null): number | null {
  if (!date) {
    return null;
  }

  const value = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(value) ? value : null;
}

function getPayloadDateBounds(payload: unknown): DateBounds {
  if (!payload || typeof payload !== "object") {
    return { startMs: null, endMs: null };
  }

  const record = payload as Record<string, unknown>;
  return {
    startMs: dateTokenToMs(normalizeDateToken(record.start_date)),
    endMs: dateTokenToMs(normalizeDateToken(record.end_date))
  };
}

function enumerateBoundDates(bounds: DateBounds): string[] {
  if (bounds.startMs === null || bounds.endMs === null || bounds.endMs < bounds.startMs) {
    return [];
  }

  const startMs = bounds.startMs;
  const endMs = bounds.endMs;
  const dayCount = Math.floor((endMs - startMs) / DAY_MS) + 1;
  if (dayCount < 1 || dayCount > 5000) {
    return [];
  }

  return Array.from({ length: dayCount }, (_, index) =>
    new Date(startMs + index * DAY_MS).toISOString().slice(0, 10)
  );
}

function isSmallNumericDateLike(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1_000_000_000;
}

function normalizeDateCandidate(value: unknown, bounds: DateBounds): string | null {
  if (isSmallNumericDateLike(value)) {
    return null;
  }

  const date = normalizeDateToken(value);
  if (!date) {
    return null;
  }

  const dateMs = dateTokenToMs(date);
  if (dateMs === null) {
    return null;
  }

  if (bounds.startMs !== null && dateMs < bounds.startMs - DAY_MS) {
    return null;
  }

  if (bounds.endMs !== null && dateMs > bounds.endMs + DAY_MS) {
    return null;
  }

  return date;
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

function measureAliases(measure: Record<string, unknown>): string[] {
  return MEASURE_KEYS.map((key) => measure[key])
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map(String)
    .filter(Boolean);
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

function getPreferredMeasureRank(text: string, preferredKeys: string[]): number | null {
  const normalizedText = normalizeSearchText(text);
  const rank = preferredKeys
    .map(normalizeSearchText)
    .findIndex((key) => key.length > 0 && normalizedText.includes(key));
  return rank >= 0 ? rank : null;
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

function getPointMeasureText(point: unknown): string {
  if (Array.isArray(point)) {
    return point
      .slice(1)
      .filter((value): value is string => typeof value === "string")
      .filter((value) => !normalizeDateToken(value) && !isNumericCandidate(value))
      .join(" ");
  }

  if (point && typeof point === "object") {
    const record = point as Record<string, unknown>;
    return POINT_MEASURE_KEYS.map((key) => describeMeasureValue(record[key]))
      .filter((value): value is string => Boolean(value))
      .join(" ");
  }

  return "";
}

function getMeasureIndexForBase(value: unknown, base: MeasureBase, measures: Record<string, unknown>[]): number | null {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    return null;
  }

  const measureIndex = numberValue - base;
  return measureIndex >= 0 && measureIndex < measures.length ? measureIndex : null;
}

function getArrayMeasureInfo(
  point: unknown[],
  spec: ArrayMeasureSpec,
  measures: Record<string, unknown>[]
): { index: number; text: string } | null {
  const measureIndex = getMeasureIndexForBase(point[spec.position], spec.base, measures);
  if (measureIndex === null) {
    return null;
  }

  return { index: measureIndex, text: measureText(measures[measureIndex]) };
}

function inferArrayMeasureSpec(
  values: unknown[],
  measures: Record<string, unknown>[],
  preferredKeys: string[]
): ArrayMeasureSpec | null {
  if (measures.length === 0) {
    return null;
  }

  const scores = new Map<
    string,
    {
      position: number;
      base: MeasureBase;
      count: number;
      preferredCount: number;
      preferredMeasureIndex: number | null;
      matchedMeasure: string | null;
    }
  >();

  for (const point of values) {
    if (!Array.isArray(point)) {
      continue;
    }

    point.forEach((value, position) => {
      for (const base of [0, 1] as const) {
        const measureIndex = getMeasureIndexForBase(value, base, measures);
        if (measureIndex === null) {
          continue;
        }

        const key = `${position}:${base}`;
        const measure = measures[measureIndex];
        const text = measureText(measure);
        const preferred = matchesPreferredMeasureText(text, preferredKeys);
        const current =
          scores.get(key) ?? {
            position,
            base,
            count: 0,
            preferredCount: 0,
            preferredMeasureIndex: null,
            matchedMeasure: null
          };

        current.count += 1;
        if (preferred) {
          current.preferredCount += 1;
          current.preferredMeasureIndex = measureIndex;
          current.matchedMeasure = text;
        }

        scores.set(key, current);
      }
    });
  }

  const candidates = [...scores.values()].sort(
    (left, right) =>
      right.preferredCount - left.preferredCount ||
      right.count - left.count ||
      left.position - right.position ||
      left.base - right.base
  );
  const preferredCandidate = candidates.find((candidate) => candidate.preferredCount > 0);
  const fallbackCandidate = measures.length === 1 ? candidates[0] : undefined;
  const selected = preferredCandidate ?? fallbackCandidate;

  if (!selected) {
    return null;
  }

  return {
    position: selected.position,
    base: selected.base,
    preferredMeasureIndex: selected.preferredMeasureIndex,
    matchedMeasure: selected.matchedMeasure
  };
}

function isArrayMeasureIndex(point: unknown[], index: number, measureSpec: ArrayMeasureSpec | null): boolean {
  if (!measureSpec) {
    return false;
  }

  return index === measureSpec.position;
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

function getSummaryTotalRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const summary = (payload as { summary?: unknown }).summary;
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const total = (summary as { total?: unknown }).total;
  return total && typeof total === "object" && !Array.isArray(total) ? (total as Record<string, unknown>) : null;
}

function getMeasureSummaryTotal(payload: unknown, measure: Record<string, unknown>): number | null {
  const total = getSummaryTotalRecord(payload);
  if (!total) {
    return null;
  }

  for (const alias of measureAliases(measure)) {
    if (alias in total && isNumericCandidate(total[alias])) {
      return toFiniteNumber(total[alias]);
    }
  }

  const normalizedAliases = new Set(measureAliases(measure).map(normalizeSearchText));
  const normalizedMatch = Object.entries(total).find(
    ([key, value]) => normalizedAliases.has(normalizeSearchText(key)) && isNumericCandidate(value)
  );

  return normalizedMatch ? toFiniteNumber(normalizedMatch[1]) : null;
}

function getPreferredMeasureMatch(
  payload: unknown,
  measures: Record<string, unknown>[],
  preferredKeys: string[]
): PreferredMeasureMatch | null {
  const matches = measures
    .map((measure, index) => ({
      index,
      measure,
      rank: getPreferredMeasureRank(measureText(measure), preferredKeys)
    }))
    .filter((match): match is { index: number; measure: Record<string, unknown>; rank: number } => match.rank !== null)
    .sort((left, right) => left.rank - right.rank || left.index - right.index);

  if (matches.length === 0) {
    return null;
  }

  const selected = matches[0];

  return {
    index: selected.index,
    matchedMeasure: measureText(selected.measure),
    summaryTotal: getMeasureSummaryTotal(payload, selected.measure)
  };
}

function pickNumericValue(
  point: unknown,
  preferredKeys: string[],
  preferredMeasureValueIndex: number | null,
  measureSpec: ArrayMeasureSpec | null,
  ignoredIndexes: Set<number> = new Set()
): number {
  if (Array.isArray(point)) {
    if (
      preferredMeasureValueIndex !== null &&
      !ignoredIndexes.has(preferredMeasureValueIndex) &&
      !isArrayMeasureIndex(point, preferredMeasureValueIndex, measureSpec) &&
      isNumericCandidate(point[preferredMeasureValueIndex])
    ) {
      return toFiniteNumber(point[preferredMeasureValueIndex]);
    }

    const numeric = point
      .map((value, index) => ({ value, index }))
      .find(
        ({ value, index }) =>
          !ignoredIndexes.has(index) && !isArrayMeasureIndex(point, index, measureSpec) && isNumericCandidate(value)
      );
    return toFiniteNumber(numeric?.value);
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

function pickArrayDate(point: unknown[], bounds: DateBounds): PickedDate {
  const candidates = point
    .map((value, index) => ({ date: normalizeDateCandidate(value, bounds), value, index }))
    .filter((candidate): candidate is { date: string; value: unknown; index: number } => Boolean(candidate.date));

  const stringCandidate = candidates.find((candidate) => typeof candidate.value === "string");
  const timestampCandidate = candidates.find((candidate) => typeof candidate.value === "number");
  const selected = stringCandidate ?? timestampCandidate;
  if (selected) {
    return { date: selected.date, index: selected.index };
  }

  const fallbackDate =
    bounds.startMs === null && bounds.endMs === null ? normalizeDateToken(point[0]) : null;
  return { date: fallbackDate, index: fallbackDate ? 0 : null };
}

function pickDate(point: unknown, bounds: DateBounds): PickedDate {
  if (Array.isArray(point)) {
    return pickArrayDate(point, bounds);
  }

  if (point && typeof point === "object") {
    const record = point as Record<string, unknown>;
    for (const key of DATE_KEYS) {
      const date = normalizeDateCandidate(record[key], bounds) ?? normalizeDateToken(record[key]);
      if (date) {
        return { date, index: null };
      }
    }
  }

  return { date: null, index: null };
}

function getArrayValueIndex(
  point: unknown[],
  preferredMeasureValueIndex: number | null,
  measureSpec: ArrayMeasureSpec | null,
  ignoredIndexes: Set<number>
): number | null {
  if (
    preferredMeasureValueIndex !== null &&
    !ignoredIndexes.has(preferredMeasureValueIndex) &&
    !isArrayMeasureIndex(point, preferredMeasureValueIndex, measureSpec) &&
    isNumericCandidate(point[preferredMeasureValueIndex])
  ) {
    return preferredMeasureValueIndex;
  }

  const match = point
    .map((value, index) => ({ value, index }))
    .find(
      ({ value, index }) =>
        !ignoredIndexes.has(index) && !isArrayMeasureIndex(point, index, measureSpec) && isNumericCandidate(value)
    );
  return match?.index ?? null;
}

function isFlatPrimitiveValues(values: unknown[]): boolean {
  return values.length > 0 && values.every((value) => !Array.isArray(value) && (value === null || typeof value !== "object"));
}

function valuesNearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.01, Math.abs(right) * 0.000001);
}

function flatCandidateValues(
  values: unknown[],
  dates: string[],
  measureCount: number,
  measureIndex: number,
  layout: FlatPrimitiveLayout
): number[] {
  return dates.map((_, dateIndex) => {
    const valueIndex =
      layout === "date-major"
        ? dateIndex * measureCount + measureIndex
        : measureIndex * dates.length + dateIndex;
    return toFiniteNumber(values[valueIndex]);
  });
}

function flatCandidateSeriesMatch(left: FlatPrimitiveCandidate, right: FlatPrimitiveCandidate): boolean {
  return left.values.length === right.values.length && left.values.every((value, index) => valuesNearlyEqual(value, right.values[index]));
}

function analyzeFlatPrimitiveValues(
  payload: unknown,
  values: unknown[],
  measures: Record<string, unknown>[],
  bounds: DateBounds,
  preferredKeys: string[]
): FlatPrimitiveAnalysis | null {
  if (!isFlatPrimitiveValues(values)) {
    return null;
  }

  const dates = enumerateBoundDates(bounds);
  const measureCount = measures.length;
  const lengthMatches = dates.length > 0 && measureCount > 0 && values.length === dates.length * measureCount;
  const measure = getPreferredMeasureMatch(payload, measures, preferredKeys);

  if (!lengthMatches || !measure) {
    return {
      dates,
      measureCount,
      lengthMatches,
      measure,
      candidates: [],
      selected: null
    };
  }

  const candidates = (["date-major", "measure-major"] as const).map((layout) => {
    const candidateValues = flatCandidateValues(values, dates, measureCount, measure.index, layout);
    const sum = candidateValues.reduce((total, value) => total + value, 0);
    return {
      layout,
      values: candidateValues,
      sum,
      difference: measure.summaryTotal === null ? null : Math.abs(sum - measure.summaryTotal)
    };
  });

  if (measure.summaryTotal === null) {
    return { dates, measureCount, lengthMatches, measure, candidates, selected: null };
  }

  const summaryMatches = candidates.filter((candidate) => valuesNearlyEqual(candidate.sum, measure.summaryTotal ?? 0));
  const selected =
    summaryMatches.length === 1
      ? summaryMatches[0]
      : summaryMatches.length > 1 && flatCandidateSeriesMatch(summaryMatches[0], summaryMatches[1])
        ? summaryMatches[0]
        : null;

  return { dates, measureCount, lengthMatches, measure, candidates, selected };
}

function extractFlatPrimitiveSeries(
  payload: unknown,
  values: unknown[],
  measures: Record<string, unknown>[],
  bounds: DateBounds,
  preferredKeys: string[]
): Map<string, number> | null {
  const analysis = analyzeFlatPrimitiveValues(payload, values, measures, bounds, preferredKeys);
  if (!analysis?.selected) {
    return null;
  }

  return new Map(analysis.dates.map((date, index) => [date, analysis.selected?.values[index] ?? 0]));
}

function primitiveTypeSample(values: unknown[]): string[] {
  return [
    ...new Set(
      values.slice(0, 25).map((value) => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value))
    )
  ];
}

function describeValueShape(
  payload: unknown,
  values: unknown[],
  measures: Record<string, unknown>[],
  bounds: DateBounds,
  preferredKeys: string[]
): Record<string, unknown> | null {
  const flatPrimitiveAnalysis = analyzeFlatPrimitiveValues(payload, values, measures, bounds, preferredKeys);
  if (flatPrimitiveAnalysis) {
    const bestCandidate =
      flatPrimitiveAnalysis.selected ??
      [...flatPrimitiveAnalysis.candidates].sort(
        (left, right) => (left.difference ?? Number.POSITIVE_INFINITY) - (right.difference ?? Number.POSITIVE_INFINITY)
      )[0];

    return {
      primitive_values_count: values.length,
      date_count: flatPrimitiveAnalysis.dates.length,
      measure_count: flatPrimitiveAnalysis.measureCount,
      matched_measure: flatPrimitiveAnalysis.measure?.matchedMeasure ?? null,
      summary_total: flatPrimitiveAnalysis.measure?.summaryTotal ?? null,
      candidate_layout: bestCandidate?.layout ?? null,
      candidate_sum: bestCandidate?.sum ?? null,
      primitive_types: primitiveTypeSample(values)
    };
  }

  const arrayValues = values.filter((value): value is unknown[] => Array.isArray(value));
  if (arrayValues.length === 0) {
    return null;
  }

  const measureSpec = inferArrayMeasureSpec(arrayValues, measures, preferredKeys);
  const preferredPoint =
    measureSpec?.preferredMeasureIndex !== null && measureSpec?.preferredMeasureIndex !== undefined
      ? arrayValues.find((point) => getArrayMeasureInfo(point, measureSpec, measures)?.index === measureSpec.preferredMeasureIndex)
      : undefined;
  const samplePoint = preferredPoint ?? arrayValues[0];
  const pickedDate = pickArrayDate(samplePoint, bounds);
  const ignoredIndexes = new Set<number>();
  if (pickedDate.index !== null) {
    ignoredIndexes.add(pickedDate.index);
  }

  if (measureSpec) {
    ignoredIndexes.add(measureSpec.position);
  }

  return {
    array_lengths: [...new Set(arrayValues.slice(0, 10).map((value) => value.length))],
    primitive_types: samplePoint.map((value) =>
      value === null ? "null" : Array.isArray(value) ? "array" : typeof value
    ),
    date_index: pickedDate.index,
    measure_index: measureSpec?.position ?? null,
    measure_base: measureSpec?.base ?? null,
    value_index: getArrayValueIndex(samplePoint, null, measureSpec, ignoredIndexes),
    matched_measure: measureSpec?.matchedMeasure ?? null
  };
}

export function extractRevenueCatDailySeries(
  payload: unknown,
  preferredKeys: string[] = ["value", "amount", "revenue", "proceeds", "count"]
): Map<string, number> {
  const values = payload && typeof payload === "object" ? (payload as { values?: unknown }).values : undefined;
  const sourceValues = Array.isArray(values) ? values : [];
  const measures = getMeasures(payload);
  const bounds = getPayloadDateBounds(payload);
  const preferredMeasureValueIndex = getPreferredMeasureValueIndex(payload, preferredKeys);
  const flatPrimitiveSeries = extractFlatPrimitiveSeries(payload, sourceValues, measures, bounds, preferredKeys);
  if (flatPrimitiveSeries) {
    return flatPrimitiveSeries;
  }

  const measureSpec = inferArrayMeasureSpec(sourceValues, measures, preferredKeys);
  const shouldFilterByPointMeasure = sourceValues.some((point) =>
    matchesPreferredMeasureText(getPointMeasureText(point), preferredKeys)
  );
  const shouldFilterByIndexedMeasure =
    !shouldFilterByPointMeasure && measureSpec !== null && measureSpec.preferredMeasureIndex !== null;
  const series = new Map<string, number>();

  for (const point of sourceValues) {
    const pointMeasureText = getPointMeasureText(point);
    if (shouldFilterByPointMeasure && !matchesPreferredMeasureText(pointMeasureText, preferredKeys)) {
      continue;
    }

    const pickedDate = pickDate(point, bounds);
    const date = pickedDate.date;
    if (!date) {
      continue;
    }

    const ignoredIndexes = new Set<number>();
    if (pickedDate.index !== null) {
      ignoredIndexes.add(pickedDate.index);
    }

    if (Array.isArray(point) && measureSpec) {
      const measureInfo = getArrayMeasureInfo(point, measureSpec, measures);
      ignoredIndexes.add(measureSpec.position);

      if (
        shouldFilterByIndexedMeasure &&
        measureInfo?.index !== measureSpec.preferredMeasureIndex
      ) {
        continue;
      }
    }

    const value = pickNumericValue(point, preferredKeys, preferredMeasureValueIndex, measureSpec, ignoredIndexes);
    series.set(
      date,
      shouldFilterByPointMeasure || shouldFilterByIndexedMeasure ? (series.get(date) ?? 0) + value : value
    );
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

export function describeRevenueCatChartDiagnostics(
  payload: unknown,
  preferredKeys: string[] = ["value", "amount", "revenue", "proceeds", "count"]
): string {
  if (!payload || typeof payload !== "object") {
    return JSON.stringify({ payload_type: typeof payload });
  }

  const record = payload as Record<string, unknown>;
  const values = record.values;
  const sourceValues = Array.isArray(values) ? values : [];
  const measures = getMeasures(payload);
  const bounds = getPayloadDateBounds(payload);
  const diagnostics = {
    object: getRecordValue(record, "object"),
    category: getRecordValue(record, "category"),
    display_name: getRecordValue(record, "display_name"),
    start_date: getRecordValue(record, "start_date"),
    end_date: getRecordValue(record, "end_date"),
    values_count: Array.isArray(values) ? values.length : 0,
    value_shape: describeValueShape(payload, sourceValues, measures, bounds, preferredKeys),
    measures: redactSensitiveValue("measures", record.measures),
    summary: redactSensitiveValue("summary", record.summary),
    user_selectors: redactSensitiveValue("user_selectors", record.user_selectors),
    unsupported_params: redactSensitiveValue("unsupported_params", record.unsupported_params)
  };

  return JSON.stringify(diagnostics).slice(0, 1500);
}
