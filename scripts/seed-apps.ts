import { createClient } from "@supabase/supabase-js";
import { DEFAULT_APP_MAPPINGS } from "@/lib/sync/app-mapping";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed apps.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const rows = DEFAULT_APP_MAPPINGS.map((mapping) => ({
  app_name: mapping.appName,
  revenuecat_project_id: mapping.revenueCatProjectNames[0],
  windsor_app_names: mapping.windsorAppNames,
  campaign_aliases: mapping.campaignAliases,
  is_active: true
}));

const { error } = await supabase
  .from("apps")
  .upsert(rows, { onConflict: "app_name" });

if (error) {
  throw error;
}

console.log(`Seeded ${rows.length} apps.`);
