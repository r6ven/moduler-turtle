import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { UIController } from "../src/UIController.js";

class ClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  toggle(name, force) {
    if (force) this.values.add(name);
    else this.values.delete(name);
  }

  contains(name) {
    return this.values.has(name);
  }
}

function makeModeElement(key, attribute) {
  return {
    dataset: { [attribute]: key },
    classList: new ClassList(),
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

test("signed-in menu exposes three isolated mode entries", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const modes = Array.from(
    html.matchAll(/data-menu-mode="(story|endless|daily)"/g),
    (match) => match[1]
  );
  const storyPanel = html.slice(
    html.indexOf('id="story-mode-panel"'),
    html.indexOf('id="endless-mode-panel"')
  );

  assert.deepEqual(modes, ["story", "endless", "daily"]);
  assert.match(storyPanel, /id="continue-game-btn"/);
  assert.match(storyPanel, /id="levels-btn"/);
  assert.match(storyPanel, /id="records-btn"/);
  assert.match(html, /id="endless-mode-panel"[^>]*hidden/);
  assert.match(html, /id="daily-mode-panel"[^>]*hidden/);
  assert.match(html, /data-sprint-kind="training"/);
  assert.match(html, /data-sprint-kind="ranked"/);
  assert.match(html, /id="ranked-rules-overlay"/);
  assert.match(html, /id="start-ranked-btn"/);
});

test("switching menu modes does not invoke story game actions", () => {
  const tabs = ["story", "endless", "daily"].map((mode) =>
    makeModeElement(mode, "menuMode")
  );
  const panels = ["story", "endless", "daily"].map((mode) =>
    makeModeElement(mode, "modePanel")
  );
  const context = {
    menuModeTabs: tabs,
    menuModePanels: panels,
    gameMenuCard: {
      dataset: {},
      classList: new ClassList()
    },
    restartGameButton: { classList: new ClassList() },
    footerDivider: { classList: new ClassList() }
  };

  UIController.prototype.showMenuMode.call(context, "endless");

  assert.equal(context.gameMenuCard.dataset.activeMode, "endless");
  assert.equal(context.gameMenuCard.classList.contains("future-mode-active"), true);
  assert.equal(context.restartGameButton.classList.contains("hidden"), true);
  assert.equal(tabs[1].classList.contains("active"), true);
  assert.equal(tabs[1].attributes["aria-selected"], "true");
  assert.equal(panels[0].classList.contains("hidden"), true);
  assert.equal(panels[1].classList.contains("hidden"), false);

  UIController.prototype.showMenuMode.call(context, "story");

  assert.equal(context.gameMenuCard.dataset.activeMode, "story");
  assert.equal(context.restartGameButton.classList.contains("hidden"), false);
  assert.equal(panels[0].classList.contains("hidden"), false);
  assert.equal(panels[1].classList.contains("hidden"), true);
});
