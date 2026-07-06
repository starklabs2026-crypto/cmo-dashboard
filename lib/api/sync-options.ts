export type SyncRequestOptions = {
  dateFrom?: string;
  dateTo?: string;
};

export async function syncOptionsFromRequest(request: Request): Promise<SyncRequestOptions> {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  return {
    dateFrom:
      url.searchParams.get("date_from") ??
      (typeof body.date_from === "string" ? body.date_from : undefined) ??
      (typeof body.dateFrom === "string" ? body.dateFrom : undefined),
    dateTo:
      url.searchParams.get("date_to") ??
      (typeof body.date_to === "string" ? body.date_to : undefined) ??
      (typeof body.dateTo === "string" ? body.dateTo : undefined)
  };
}
