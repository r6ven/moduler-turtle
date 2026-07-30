import { createClient } from "npm:@supabase/supabase-js@2";
import { PuzzleGenerator } from "../../../src/PuzzleGenerator.js";
import { createRankedSeasonManifest } from "../../../src/RankedCalendar.js";
import { getRankedProfile } from "../../../src/RankedSprintConfig.js";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function nextMonthSeason(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
}

Deno.serve(async (request) => {
  const cronSecret = Deno.env.get("RANKED_CRON_SECRET") || "";
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return json({ ok: false, error: "unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const puzzleSecret = Deno.env.get("RANKED_PUZZLE_SECRET");
  if (!url || !serviceKey || !puzzleSecret) return json({ ok: false, error: "missing_server_secret" }, 500);

  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const seasonId = typeof body.seasonId === "string" ? body.seasonId : nextMonthSeason();
  const manifest = createRankedSeasonManifest({ seasonId, secretSeed: `${puzzleSecret}:${seasonId}` });
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: seasonError } = await supabase.from("ranked_seasons").upsert({ season_id: seasonId, generator_version: 2, status: "draft" }, { onConflict: "season_id" });
  if (seasonError) return json({ ok: false, error: seasonError.message }, 500);

  const slots = manifest.slots.map((slot) => {
    const profile = getRankedProfile(slot.slot);
    const generated = PuzzleGenerator.generate({
      mode: "daily",
      puzzleId: slot.puzzleId,
      seed: slot.seed,
      mapRadius: profile.mapRadius,
      activeTileCount: profile.activeTileCount,
      extraLoopChance: profile.extraLoopChance,
      tutorial: false,
      quality: { minimumMoves: profile.minimumMoves, maxInitialConnectedRatio: 0.25 }
    });
    return {
      season_id: seasonId,
      play_date: slot.published ? slot.playDate : null,
      day_of_month: Number(slot.playDate.slice(-2)),
      slot: slot.slot,
      profile_id: profile.id,
      difficulty_weight: profile.difficultyWeight,
      seed: slot.seed,
      puzzle_id: slot.puzzleId,
      checksum: generated.checksum,
      definition: generated.definition,
      minimum_moves: generated.minimumMoves,
      star_tolerance: profile.starTolerance,
      published: slot.published
    };
  });

  for (let offset = 0; offset < slots.length; offset += 25) {
    const { error } = await supabase.from("ranked_puzzle_slots").upsert(slots.slice(offset, offset + 25), { onConflict: "season_id,day_of_month,slot" });
    if (error) return json({ ok: false, error: error.message, offset }, 500);
  }
  const { error: publishError } = await supabase.from("ranked_seasons").update({ status: "published", published_at: new Date().toISOString() }).eq("season_id", seasonId);
  if (publishError) return json({ ok: false, error: publishError.message }, 500);
  return json({ ok: true, seasonId, storedSlots: slots.length, publishedSlots: slots.filter((slot) => slot.published).length });
});
