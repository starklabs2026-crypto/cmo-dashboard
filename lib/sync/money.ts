export const DEFAULT_USD_TO_INR = 95.22;

export function toFiniteNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function convertUsdToInr(valueUsd: unknown, usdToInr = DEFAULT_USD_TO_INR): number {
  return roundCurrency(toFiniteNumber(valueUsd) * usdToInr);
}

export function convertCurrencyToInr(value: unknown, currency?: string | null, usdToInr = DEFAULT_USD_TO_INR): number {
  const amount = toFiniteNumber(value);
  if (!currency || currency.toUpperCase() === "INR") {
    return roundCurrency(amount);
  }

  if (currency.toUpperCase() === "USD") {
    return convertUsdToInr(amount, usdToInr);
  }

  return roundCurrency(amount);
}

export function formatInr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "NA";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "NA";
  }

  return value.toFixed(2);
}
