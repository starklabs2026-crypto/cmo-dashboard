import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "@/lib/server/env";

export function createSupabaseAdmin() {
  return createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
