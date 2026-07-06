import "server-only";

import { getOptionalEnv } from "@/lib/server/env";

export function isSyncAuthorized(request: Request): boolean {
  const url = new URL(request.url);
  const configuredSecret = getOptionalEnv("SYNC_SECRET");
  const cronSecret = getOptionalEnv("CRON_SECRET");
  const allowedSecrets = [configuredSecret, cronSecret].filter(Boolean);

  if (allowedSecrets.length === 0) {
    return false;
  }

  const headerValue = request.headers.get("authorization");
  const bearerToken = headerValue?.startsWith("Bearer ") ? headerValue.slice("Bearer ".length) : null;
  const querySecret = url.searchParams.get("secret");

  return allowedSecrets.some((secret) => secret === bearerToken || secret === querySecret);
}

export function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
