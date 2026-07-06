import { isSyncAuthorized, unauthorizedResponse } from "@/lib/api/sync-auth";
import { syncOptionsFromRequest } from "@/lib/api/sync-options";
import { runRevenueCatSync } from "@/lib/sync/revenuecat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSyncAuthorized(request)) {
    return unauthorizedResponse();
  }

  const options = await syncOptionsFromRequest(request);
  return Response.json(await runRevenueCatSync(options));
}
