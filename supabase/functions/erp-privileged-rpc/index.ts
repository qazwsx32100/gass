import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_FUNCTIONS = new Set([
  "erp_create_backup",
  "erp_get_app_state",
  "erp_get_app_state_meta",
  "erp_list_legacy_cylinder_movements",
  "erp_list_legacy_customer_cylinder_events",
  "erp_list_backups",
  "erp_mark_backup_drive_result",
  "erp_refresh_relational_mirror_deferred",
  "erp_restore_backup",
  "erp_set_app_state",
  "erp_sync_shenglong_finance",
  "erp_upsert_legacy_cylinder_movements",
  "erp_upsert_legacy_customer_cylinder_events",
]);

const json = (body: unknown, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  },
);

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8 * 1024 * 1024) {
    return json({ error: "Payload too large" }, 413);
  }

  const syncSecret = request.headers.get("x-erp-sync-secret")?.trim() || "";
  if (!syncSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let requestBody: { functionName?: string; params?: Record<string, unknown> };
  try {
    requestBody = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const functionName = String(requestBody.functionName || "");
  if (!ALLOWED_FUNCTIONS.has(functionName)) {
    return json({ error: "Function is not allowed" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  let rpcKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  try {
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    rpcKey ||= String(publishableKeys.default || "");
  } catch {
    // Legacy anon JWT remains the compatibility fallback through 2026.
  }
  if (!supabaseUrl || !rpcKey) {
    return json({ error: "Service is not configured" }, 503);
  }

  const supabase = createClient(supabaseUrl, rpcKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const params = {
    ...(requestBody.params || {}),
    p_secret: syncSecret,
  };
  const { data, error } = await supabase.rpc(functionName, params);

  if (error) {
    const unauthorized = /invalid finance sync secret|unauthorized/i.test(
      `${error.message || ""} ${error.details || ""}`,
    );
    return json(
      {
        error: unauthorized ? "Unauthorized" : "Privileged operation failed",
        code: String(error.code || "unknown"),
      },
      unauthorized ? 401 : 500,
    );
  }

  return json({ data });
});
