import assert from "node:assert/strict";
import test from "node:test";

import { UserAuthSystem } from "../src/UserAuthSystem.js";

function createRpcClient(handler) {
  const calls = [];

  return {
    calls,
    client: {
      async rpc(name, args) {
        calls.push({ name, args });
        return handler(name, args);
      }
    }
  };
}

test("session RPC login removes the password from runtime state", async () => {
  const fake = createRpcClient(async (name) => {
    if (name === "login_player_session") {
      return {
        data: {
          ok: true,
          session_token: "a".repeat(64),
          session_expires_at: "2099-01-01T00:00:00Z",
          last_level: 7,
          best_by_level: { 1: { stars: 3 } }
        },
        error: null
      };
    }

    if (name === "save_player_progress_session") {
      return {
        data: {
          ok: true,
          last_level: 8,
          best_by_level: { 1: { stars: 3 } }
        },
        error: null
      };
    }

    return { data: { ok: true }, error: null };
  });
  const auth = new UserAuthSystem({ supabase: fake.client });
  const login = await auth.login("player.one", "secret", { remember: false });

  assert.equal(login.ok, true);
  assert.equal(auth.usesSessionToken(), true);
  assert.equal(auth.currentPassword, null);
  assert.equal(auth.currentSessionToken, "a".repeat(64));

  const save = await auth.saveProgressForCurrentUser({
    lastLevel: 8,
    bestByLevel: { 1: { stars: 3 } }
  });
  const saveCall = fake.calls.find(
    (call) => call.name === "save_player_progress_session"
  );

  assert.equal(save.ok, true);
  assert.equal(saveCall.args.p_session_token, "a".repeat(64));
  assert.equal("p_password" in saveCall.args, false);

  auth.logout();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(auth.hasCurrentUser(), false);
  assert.ok(fake.calls.some((call) => call.name === "logout_player_session"));
});

test("missing session RPCs fall back without deleting existing users", async () => {
  const fake = createRpcClient(async (name) => {
    if (name === "login_player_session") {
      return {
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function"
        }
      };
    }

    if (name === "login_player") {
      return {
        data: {
          ok: true,
          last_level: 12,
          best_by_level: { 4: { stars: 2 } }
        },
        error: null
      };
    }

    throw new Error(`Unexpected RPC: ${name}`);
  });
  const auth = new UserAuthSystem({ supabase: fake.client });
  const result = await auth.login("existing.user", "legacy-pass", {
    remember: false
  });

  assert.equal(result.ok, true);
  assert.equal(auth.usesSessionToken(), false);
  assert.equal(auth.currentPassword, "legacy-pass");
  assert.equal(auth.loadProgressForCurrentUser().lastLevel, 12);
  assert.deepEqual(
    fake.calls.map((call) => call.name),
    ["login_player_session", "login_player"]
  );
});
