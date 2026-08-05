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
  "access-control-allow-headers":
    "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-expose-headers": "x-ranked-request-id",
  "cache-control": "no-store",
  "content-type": "application/json"
};

function addRequestId(body: unknown, requestId: string) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  return {
    ...(body as Record<string, unknown>),
    request_id: requestId
  };
}

function json(body: unknown, status: number, requestId: string) {
  return new Response(
    JSON.stringify(addRequestId(body, requestId)),
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "x-ranked-request-id": requestId
      }
    }
  );
}

function unwrap(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return (value[0] || {}) as Record<string, unknown>;
  }

  return (value || {}) as Record<string, unknown>;
}

function validUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error || "unknown_error");
}

async function invalidateAttempt(
  supabase: ReturnType<typeof createClient>,
  sessionToken: string,
  attemptId: string,
  reason: string,
  requestId: string
) {
  const { error } = await supabase.rpc(
    "invalidate_ranked_sprint_attempt",
    {
      p_session_token: sessionToken,
      p_attempt_id: attemptId,
      p_reason: reason
    }
  );

  if (error) {
    console.error("ranked-replay-invalidation-failed", {
      requestId,
      attemptId,
      reason,
      error: error.message
    });
  }
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "x-ranked-request-id": requestId
      }
    });
  }

  console.log("ranked-replay-request", {
    requestId,
    method: request.method,
    origin: request.headers.get("origin"),
    clientInfo: request.headers.get("x-client-info"),
    userAgent: request.headers.get("user-agent")
  });

  try {
    if (request.method !== "POST") {
      console.warn("ranked-replay-method-not-allowed", {
        requestId,
        method: request.method
      });

      return json(
        { ok: false, code: "method_not_allowed" },
        405,
        requestId
      );
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceKey) {
      console.error("ranked-replay-missing-server-config", {
        requestId,
        hasUrl: Boolean(url),
        hasServiceKey: Boolean(serviceKey)
      });

      return json(
        { ok: false, code: "missing_server_config" },
        500,
        requestId
      );
    }

    const body = await request.json().catch((error) => {
      console.error("ranked-replay-json-parse-failed", {
        requestId,
        error: errorMessage(error)
      });
      return null;
    });

    const sessionToken = body?.sessionToken;
    const attemptId = body?.attemptId;
    const submissionId = body?.submissionId;
    const slot = Number(body?.slot);
    const replay = body?.replay;

    const requestIsValid =
      typeof sessionToken === "string" &&
      sessionToken.length >= 16 &&
      validUuid(attemptId) &&
      validUuid(submissionId) &&
      Number.isInteger(slot) &&
      slot >= 1 &&
      slot <= 5 &&
      Array.isArray(replay) &&
      replay.length >= 1 &&
      replay.length <= MAX_RANKED_REPLAY_MOVES &&
      replay.every(
        (key) => typeof key === "string" && key.length <= 32
      );

    if (!requestIsValid) {
      console.error("ranked-replay-invalid-request", {
        requestId,
        hasSessionToken:
          typeof sessionToken === "string" && sessionToken.length >= 16,
        attemptIdValid: validUuid(attemptId),
        submissionIdValid: validUuid(submissionId),
        slot,
        replayIsArray: Array.isArray(replay),
        replayLength: Array.isArray(replay) ? replay.length : null,
        replayKeysValid: Array.isArray(replay)
          ? replay.every(
              (key) => typeof key === "string" && key.length <= 32
            )
          : false
      });

      return json(
        { ok: false, code: "invalid_request" },
        400,
        requestId
      );
    }

    const supabase = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    console.log("ranked-replay-context-start", {
      requestId,
      attemptId,
      submissionId,
      slot,
      replayLength: replay.length
    });

    const { data: contextData, error: contextError } =
      await supabase.rpc(
        "get_ranked_replay_context",
        {
          p_session_token: sessionToken,
          p_attempt_id: attemptId,
          p_slot: slot
        }
      );

    if (contextError) {
      console.error("ranked-replay-context-error", {
        requestId,
        attemptId,
        slot,
        error: contextError.message
      });

      return json(
        {
          ok: false,
          code: "context_error",
          error: contextError.message
        },
        500,
        requestId
      );
    }

    const context = unwrap(contextData);

    console.log("ranked-replay-context-result", {
      requestId,
      attemptId,
      slot,
      ok: context.ok === true,
      code: context.code || null,
      alreadyCompleted: context.already_completed === true
    });

    if (context.ok !== true) {
      const code = String(context.code || "attempt_not_ready");

      return json(
        { ok: false, code },
        code === "invalid_session" ? 401 : 409,
        requestId
      );
    }

    if (context.already_completed === true) {
      if (context.submission_id !== submissionId) {
        console.warn("ranked-replay-slot-already-completed", {
          requestId,
          attemptId,
          slot,
          submissionId
        });

        return json(
          { ok: false, code: "slot_already_completed" },
          409,
          requestId
        );
      }

      console.log("ranked-replay-idempotent-retry", {
        requestId,
        attemptId,
        slot,
        submissionId
      });

      const { data, error } = await supabase.rpc(
        "accept_ranked_replay",
        {
          p_session_token: sessionToken,
          p_attempt_id: attemptId,
          p_slot: slot,
          p_submission_id: submissionId,
          p_replay: replay,
          p_move_count: replay.length,
          p_final_state_hash: "retry"
        }
      );

      if (error) {
        console.error("ranked-replay-idempotent-accept-error", {
          requestId,
          attemptId,
          slot,
          error: error.message
        });

        return json(
          {
            ok: false,
            code: "accept_error",
            error: error.message
          },
          500,
          requestId
        );
      }

      return json(unwrap(data), 200, requestId);
    }

    const definition = context.gameplay_definition;
    const expectedChecksum = String(
      context.gameplay_checksum || ""
    );
    const schemaVersion = Number(context.schema_version);
    const rulesVersion = String(context.rules_version || "");
    let actualChecksum = "";

    try {
      actualChecksum = calculateObjectChecksum(definition);
    } catch (error) {
      console.error("ranked-replay-checksum-calculation-failed", {
        requestId,
        attemptId,
        slot,
        error: errorMessage(error)
      });

      await invalidateAttempt(
        supabase,
        sessionToken,
        attemptId,
        "server_definition_mismatch",
        requestId
      );

      return json(
        {
          ok: false,
          code: "server_definition_mismatch"
        },
        500,
        requestId
      );
    }

    if (
      schemaVersion !== PUZZLE_DEFINITION_SCHEMA_VERSION ||
      rulesVersion !== RANKED_RULES_VERSION ||
      actualChecksum !== expectedChecksum
    ) {
      console.error("ranked-replay-definition-mismatch", {
        requestId,
        attemptId,
        slot,
        schemaVersion,
        expectedSchemaVersion:
          PUZZLE_DEFINITION_SCHEMA_VERSION,
        rulesVersion,
        expectedRulesVersion: RANKED_RULES_VERSION,
        expectedChecksum,
        actualChecksum
      });

      await invalidateAttempt(
        supabase,
        sessionToken,
        attemptId,
        "server_definition_mismatch",
        requestId
      );

      return json(
        {
          ok: false,
          code: "server_definition_mismatch"
        },
        500,
        requestId
      );
    }

    const verification = verifyPuzzleReplay({
      definition,
      replay,
      compatibility: {
        supportedSchemas: [PUZZLE_DEFINITION_SCHEMA_VERSION],
        supportedRules: [RANKED_RULES_VERSION]
      }
    });

    console.log("ranked-replay-verification-result", {
      requestId,
      attemptId,
      slot,
      valid: verification.valid,
      solved: verification.solved,
      code: verification.code || null,
      moveCount: verification.moveCount,
      connectedTileCount: verification.connectedTileCount,
      activeTileCount: verification.activeTileCount,
      danglingExitCount: verification.danglingExitCount
    });

    if (!verification.valid || !verification.solved) {
      const code = verification.code || "invalid_replay";

      await invalidateAttempt(
        supabase,
        sessionToken,
        attemptId,
        code,
        requestId
      );

      return json(
        { ok: false, code },
        422,
        requestId
      );
    }

    console.log("ranked-replay-accept-start", {
      requestId,
      attemptId,
      submissionId,
      slot,
      moveCount: verification.moveCount
    });

    const { data: acceptedData, error: acceptedError } =
      await supabase.rpc(
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
      console.error("ranked-replay-accept-error", {
        requestId,
        attemptId,
        slot,
        error: acceptedError.message
      });

      return json(
        {
          ok: false,
          code: "accept_error",
          error: acceptedError.message
        },
        500,
        requestId
      );
    }

    const accepted = unwrap(acceptedData);

    if (accepted.ok !== true) {
      console.warn("ranked-replay-accept-rejected", {
        requestId,
        attemptId,
        slot,
        code: accepted.code || null
      });

      return json(accepted, 409, requestId);
    }

    console.log("ranked-replay-accepted", {
      requestId,
      attemptId,
      submissionId,
      slot,
      moveCount: accepted.move_count,
      elapsedMs: accepted.elapsed_ms,
      sprintComplete: accepted.sprint_complete === true
    });

    return json(accepted, 200, requestId);
  } catch (error) {
    console.error("ranked-replay-unhandled-error", {
      requestId,
      error: errorMessage(error),
      stack: error instanceof Error ? error.stack : null
    });

    return json(
      {
        ok: false,
        code: "unhandled_server_error",
        error: "Replay doğrulama sırasında beklenmeyen bir hata oluştu."
      },
      500,
      requestId
    );
  }
});
