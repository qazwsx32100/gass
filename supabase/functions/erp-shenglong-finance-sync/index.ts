import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4 * 1024 * 1024) return json({ error: "Payload too large" }, 413);

  const syncSecret = request.headers.get("x-erp-sync-secret")?.trim() || "";
  if (!syncSecret) return json({ error: "Unauthorized" }, 401);

  let requestBody: { functionName?: string; params?: Record<string, unknown> };
  try {
    requestBody = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (requestBody.functionName !== "erp_sync_shenglong_finance") {
    return json({ error: "Function is not allowed" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Service is not configured" }, 503);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("erp_sync_shenglong_finance", {
    ...(requestBody.params || {}),
    p_secret: syncSecret,
  });

  if (error) {
    const unauthorized = /invalid finance sync secret|unauthorized/i.test(
      `${error.message || ""} ${error.details || ""}`,
    );
    return json(
      {
        error: unauthorized ? "Unauthorized" : "Finance sync failed",
        code: String(error.code || "unknown"),
      },
      unauthorized ? 401 : 500,
    );
  }

  return json({ data });
});
