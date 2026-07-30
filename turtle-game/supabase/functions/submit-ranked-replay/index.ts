import { createClient } from "npm:@supabase/supabase-js@2";
import {
  calculateObjectChecksum,
  PUZZLE_DEFINITION_SCHEMA_VERSION,
  RANKED_RULES_VERSION
} from "../../../src/PuzzleDefinition.js";
import {
  MAX_RANKED_REPLAY_MOVES,
  verifyPuzzleReplay
} from "../../../src/PuzzleReplayVerifier.js";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function unwrap(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] || {}) as Record<string, unknown>;
  return (value || {}) as Record<string, unknown>;
}

function validUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function invalidateAttempt(
  supabase: ReturnType<typeof createClient>,
  sessionToken: string,
  attemptId: string,
  reason: string
) {
  await supabase.rpc("invalidate_ranked_sprint_attempt", {
    p_session_token: sessionToken,
    p_attempt_id: attemptId,
    p_reason: reason
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ ok: false, code: "method_not_allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ ok: false, code: "missing_server_config" }, 500);
  }

  const body = await request.json().catch(() => null);
  const sessionToken = body?.sessionToken;
  const attemptId = body?.attemptId;
  const submissionId = body?.submissionId;
  const slot = Number(body?.slot);
  const replay = body?.replay;

  if (
    typeof sessionToken !== "string" || sessionToken.length < 16 ||
    !validUuid(attemptId) || !validUuid(submissionId) ||
    !Number.isInteger(slot) || slot < 1 || slot > 5 ||
    !Array.isArray(replay) || replay.length < 1 ||
    replay.length > MAX_RANKED_REPLAY_MOVES ||
    replay.some((key) => typeof key !== "string" || key.length > 32)
  ) {
    return json({ ok: false, code: "invalid_request" }, 400);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: contextData, error: contextError } = await supabase.rpc(
    "get_ranked_replay_context",
    {
      p_session_token: sessionToken,
      p_attempt_id: attemptId,
      p_slot: slot
    }
  );

  if (contextError) {
    return json({ ok: false, code: "context_error", error: contextError.message }, 500);
  }

  const context = unwrap(contextData);
  if (context.ok !== true) {
    const code = String(context.code || "attempt_not_ready");
    return json({ ok: false, code }, code === "invalid_session" ? 401 : 409);
  }

  if (context.already_completed === true) {
    if (context.submission_id !== submissionId) {
      return json({ ok: false, code: "slot_already_completed" }, 409);
    }

    const { data, error } = await supabase.rpc("accept_ranked_replay", {
      p_session_token: sessionToken,
      p_attempt_id: attemptId,
      p_slot: slot,
      p_submission_id: submissionId,
      p_replay: replay,
      p_move_count: replay.length,
      p_final_state_hash: "retry"
    });
    if (error) return json({ ok: false, code: "accept_error", error: error.message }, 500);
    return json(unwrap(data));
  }

  const definition = context.gameplay_definition;
  const expectedChecksum = String(context.gameplay_checksum || "");
  const schemaVersion = Number(context.schema_version);
  const rulesVersion = String(context.rules_version || "");

  if (
    schemaVersion !== PUZZLE_DEFINITION_SCHEMA_VERSION ||
    rulesVersion !== RANKED_RULES_VERSION ||
    calculateObjectChecksum(definition) !== expectedChecksum
  ) {
    await invalidateAttempt(supabase, sessionToken, attemptId, "server_definition_mismatch");
    return json({ ok: false, code: "server_definition_mismatch" }, 500);
  }

  const verification = verifyPuzzleReplay({
    definition,
    replay,
    compatibility: {
      supportedSchemas: [PUZZLE_DEFINITION_SCHEMA_VERSION],
      supportedRules: [RANKED_RULES_VERSION]
    }
  });

  if (!verification.valid || !verification.solved) {
    const code = verification.code || "invalid_replay";
    await invalidateAttempt(supabase, sessionToken, attemptId, code);
    return json({ ok: false, code }, 422);
  }

  const { data: acceptedData, error: acceptedError } = await supabase.rpc(
    "accept_ranked_replay",
    {
      p_session_token: sessionToken,
      p_attempt_id: attemptId,
      p_slot: slot,
      p_submission_id: submissionId,
      p_replay: replay,
      p_move_count: verification.moveCount,
      p_final_state_hash: verification.finalStateHash
    }
  );

  if (acceptedError) {
    return json({ ok: false, code: "accept_error", error: acceptedError.message }, 500);
  }

  const accepted = unwrap(acceptedData);
  if (accepted.ok !== true) return json(accepted, 409);
  return json(accepted);
});
