import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/202607260001_add_player_sessions.sql",
  import.meta.url
);
const bootstrapUrl = new URL(
  "../supabase/bootstrap/fresh_project.sql",
  import.meta.url
);

test("production session migration is additive for existing players", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();

  assert.match(sql, /create table if not exists public\.player_sessions/);
  assert.match(sql, /create or replace function public\.login_player_session/);
  assert.match(sql, /create or replace function public\.save_player_progress_session/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.players/);
  assert.doesNotMatch(sql, /truncate\s+(table\s+)?public\.players/);
  assert.doesNotMatch(sql, /drop\s+table\s+(if\s+exists\s+)?public\.players/);
});

test("fresh-project bootstrap hashes passwords and enables RLS", async () => {
  const sql = (await readFile(bootstrapUrl, "utf8")).toLowerCase();

  assert.match(sql, /password_hash text not null/);
  assert.match(sql, /crypt\(p_password, gen_salt\('bf', 12\)\)/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /password\s+text\s+not null/);
});
