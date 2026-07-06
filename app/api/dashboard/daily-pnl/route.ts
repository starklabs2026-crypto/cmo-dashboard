import { getDailyPnlRows } from "@/lib/dashboard/queries";
import { filtersFromUrl } from "@/lib/api/filters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    return Response.json({ rows: await getDailyPnlRows(filtersFromUrl(request.url)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load daily P&L";
    return Response.json({ error: message }, { status: 500 });
  }
}
