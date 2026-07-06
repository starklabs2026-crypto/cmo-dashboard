import "server-only";

import { DEFAULT_USD_TO_INR, toFiniteNumber } from "@/lib/sync/money";

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function getUsdToInr(): number {
  const configured = toFiniteNumber(process.env.USD_TO_INR);
  return configured > 0 ? configured : DEFAULT_USD_TO_INR;
}
