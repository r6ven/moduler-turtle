import { createClient } from "npm:@supabase/supabase-js@2.110.8";
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
Deno.serve(async (request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "missing_server_config" }, 500);

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: serverConfig, error: configError } = await supabase.rpc("get_ranked_server_config");
  const cronSecret = serverConfig?.cron_secret || "";
  if (configError || !cronSecret) return json({ ok: false, error: "missing_ranked_server_config" }, 500);
  if (request.headers.get("x-cron-secret") !== cronSecret) return json({ ok: false, error: "unauthorized" }, 401);

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const playDate = typeof body.playDate === "string" ? body.playDate : yesterday;
  const { data, error } = await supabase.rpc("finalize_ranked_day", { p_play_date: playDate });
  return error ? json({ ok: false, error: error.message }, 500) : json(data);
});

