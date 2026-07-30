import { createClient } from "npm:@supabase/supabase-js@2";
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
Deno.serve(async (request) => {
  const secret = Deno.env.get("RANKED_CRON_SECRET") || "";
  if (!secret || request.headers.get("x-cron-secret") !== secret) return json({ ok: false, error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "missing_server_config" }, 500);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const playDate = typeof body.playDate === "string" ? body.playDate : yesterday;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("finalize_ranked_day", { p_play_date: playDate });
  return error ? json({ ok: false, error: error.message }, 500) : json(data);
});
