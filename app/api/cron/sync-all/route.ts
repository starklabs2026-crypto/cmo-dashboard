import { isSyncAuthorized, unauthorizedResponse } from "@/lib/api/sync-auth";
import { runRevenueCatSync } from "@/lib/sync/revenuecat";
import { runWindsorSync } from "@/lib/sync/windsor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSyncAuthorized(request)) {
    return unauthorizedResponse();
  }

  const [revenueCat, windsor] = await Promise.all([runRevenueCatSync(), runWindsorSync()]);
  return Response.json({ revenueCat, windsor });
}

export async function POST(request: Request) {
  return GET(request);
}
