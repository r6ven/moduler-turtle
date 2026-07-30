import { createClient } from "npm:@supabase/supabase-js@2";
import {
  PUZZLE_DEFINITION_SCHEMA_VERSION,
  RANKED_RULES_VERSION
} from "../../../src/PuzzleDefinition.js";
import { PuzzleGenerator } from "../../../src/PuzzleGenerator.js";
import { createRankedSeasonManifest } from "../../../src/RankedCalendar.js";
import {
  RANKED_GENERATOR_VERSION,
  getRankedProfile
} from "../../../src/RankedSprintConfig.js";

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
  let manifest;
  try {
    manifest = createRankedSeasonManifest({
      seasonId,
      secretSeed: `${puzzleSecret}:${seasonId}`
    });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "invalid_season_id"
    }, 400);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: existing, error: lookupError } = await supabase
    .from("ranked_seasons")
    .select("status")
    .eq("season_id", seasonId)
    .maybeSingle();
  if (lookupError) return json({ ok: false, error: lookupError.message }, 500);
  if (existing?.status === "published" || existing?.status === "closed") {
    return json({ ok: false, error: "published_season_is_immutable" }, 409);
  }

  const { error: seasonError } = await supabase.from("ranked_seasons").upsert({
    season_id: seasonId,
    generator_version: RANKED_GENERATOR_VERSION,
    definition_schema_version: PUZZLE_DEFINITION_SCHEMA_VERSION,
    rules_version: RANKED_RULES_VERSION,
    status: "draft"
  }, { onConflict: "season_id" });
  if (seasonError) return json({ ok: false, error: seasonError.message }, 500);

  const generationStartedAt = performance.now();
  const slots = manifest.slots.map((slot) => {
    const profile = getRankedProfile(slot.slot);
    const generated = PuzzleGenerator.generate({
      mode: "daily",
      rulesVersion: RANKED_RULES_VERSION,
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
      generator_version: generated.generatorVersion,
      definition_schema_version: generated.schemaVersion,
      rules_version: generated.rulesVersion,
      gameplay_checksum: generated.gameplayChecksum,
      presentation_checksum: generated.presentationChecksum,
      gameplay_definition: generated.definition,
      presentation_definition: generated.presentationDefinition,
      minimum_moves: generated.minimumMoves,
      star_tolerance: profile.starTolerance,
      published: slot.published
    };
  });
  const generationMs = Math.round(performance.now() - generationStartedAt);

  for (let offset = 0; offset < slots.length; offset += 25) {
    const { error } = await supabase.from("ranked_puzzle_slots").upsert(slots.slice(offset, offset + 25), { onConflict: "season_id,day_of_month,slot" });
    if (error) return json({ ok: false, error: error.message, offset }, 500);
  }
  const { error: publishError } = await supabase.from("ranked_seasons")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("season_id", seasonId)
    .eq("status", "draft");
  if (publishError) return json({ ok: false, error: publishError.message }, 500);
  return json({
    ok: true,
    seasonId,
    storedSlots: slots.length,
    publishedSlots: slots.filter((slot) => slot.published).length,
    generationMs
  });
});
