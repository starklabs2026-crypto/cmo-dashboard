import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncSource = "revenuecat" | "windsor" | "all";

export type SyncRunResult = {
  id: string | null;
  source: SyncSource;
  status: "running" | "success" | "failed";
  rowsSynced: number;
  errorMessage?: string;
};

export async function startSyncRun(
  supabase: SupabaseClient,
  source: SyncSource
): Promise<string | null> {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({ source, status: "running" })
    .select("id")
    .single();

  if (error) {
    console.error(`Failed to create ${source} sync run`, error);
    return null;
  }

  return data?.id ?? null;
}

export async function finishSyncRun(
  supabase: SupabaseClient,
  id: string | null,
  status: "success" | "failed",
  rowsSynced: number,
  errorMessage?: string
): Promise<void> {
  if (!id) {
    return;
  }

  const { error } = await supabase
    .from("sync_runs")
    .update({
      status,
      rows_synced: rowsSynced,
      error_message: errorMessage ?? null,
      sync_finished_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    console.error("Failed to update sync run", error);
  }
}
