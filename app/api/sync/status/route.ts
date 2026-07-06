import { getSyncStatus } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json({ rows: await getSyncStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load sync status";
    return Response.json({ error: message }, { status: 500 });
  }
}
