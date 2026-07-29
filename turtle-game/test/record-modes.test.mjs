import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { UIController } from "../src/UIController.js";

test("record screen exposes story, endless and daily leaderboards", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const modes = Array.from(
    html.matchAll(/data-record-mode="(story|endless|daily)"/g),
    (match) => match[1]
  );

  assert.deepEqual(modes, ["story", "endless", "daily"]);
  assert.match(html, /id="records-description"/);
});

test("story winner comparison prioritizes stars, moves and then time", () => {
  const compare = UIController.prototype.compareStoryRecords;
  const base = {
    username: "Mira",
    stars: 3,
    moves: 20,
    timeSeconds: 80
  };

  assert.ok(compare({ ...base, stars: 3 }, { ...base, stars: 2 }) < 0);
  assert.ok(compare({ ...base, moves: 19 }, base) < 0);
  assert.ok(compare({ ...base, timeSeconds: 79 }, base) < 0);
});
