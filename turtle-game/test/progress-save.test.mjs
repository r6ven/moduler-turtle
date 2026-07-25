import assert from "node:assert/strict";
import test from "node:test";

import { ProgressSystem } from "../src/ProgressSystem.js";

function createStorage() {
  const values = new Map();

  return {
    values,
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

test("remote progress saves execute in creation order", async () => {
  globalThis.localStorage = createStorage();

  const pending = [];
  const calls = [];
  const auth = {
    hasCurrentUser: () => true,
    getCurrentUsername: () => "queue-user",
    loadProgressForCurrentUser: () => ({ lastLevel: 1, bestByLevel: {} }),
    saveProgressForCurrentUser: (progress) => {
      calls.push(progress);
      const deferred = createDeferred();
      pending.push(deferred);
      return deferred.promise;
    }
  };
  const progress = new ProgressSystem(auth);

  progress.startLevel(2, 12, 4);
  progress.startLevel(3, 13, 5);

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].lastLevel, 2);

  pending[0].resolve({ ok: true });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 2);
  assert.equal(calls[1].lastLevel, 3);

  pending[1].resolve({ ok: true });
  await progress.waitForPendingSaves();
  assert.equal(localStorage.values.size, 0);
});

test("a failed remote save is recovered from the local pending snapshot", async () => {
  globalThis.localStorage = createStorage();

  const failingAuth = {
    hasCurrentUser: () => true,
    getCurrentUsername: () => "recovery-user",
    loadProgressForCurrentUser: () => ({ lastLevel: 1, bestByLevel: {} }),
    saveProgressForCurrentUser: async () => ({ ok: false, error: "offline" })
  };
  const first = new ProgressSystem(failingAuth);

  first.startLevel(6, 18, 8);
  await first.waitForPendingSaves();

  assert.equal(first.lastSaveError, "offline");
  assert.equal(localStorage.values.size, 1);

  const recoveredCalls = [];
  const recoveredAuth = {
    hasCurrentUser: () => true,
    getCurrentUsername: () => "recovery-user",
    loadProgressForCurrentUser: () => ({ lastLevel: 1, bestByLevel: {} }),
    saveProgressForCurrentUser: async (snapshot) => {
      recoveredCalls.push(snapshot);
      return { ok: true, progress: snapshot };
    }
  };
  const recovered = new ProgressSystem(recoveredAuth);

  assert.equal(recovered.lastLevel, 6);
  await recovered.waitForPendingSaves();
  assert.equal(recoveredCalls.length, 1);
  assert.equal(recoveredCalls[0].lastLevel, 6);
  assert.equal(localStorage.values.size, 0);
});
