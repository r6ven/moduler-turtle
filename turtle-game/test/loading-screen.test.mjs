import assert from "node:assert/strict";
import test from "node:test";

import { LoadingScreen } from "../src/LoadingScreen.js";

globalThis.window = {
  setTimeout
};

class FakeClassList {
  constructor(...names) {
    this.names = new Set(names);
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }

  contains(name) {
    return this.names.has(name);
  }
}

const createLoadingElements = () => {
  const attributes = new Map();

  return {
    message: {
      innerText: ""
    },
    root: {
      classList: new FakeClassList("active"),
      dataset: {},
      setAttribute(name, value) {
        attributes.set(name, value);
      },
      getAttribute(name) {
        return attributes.get(name);
      }
    }
  };
};

test("loading screen selects a supported design and closes cleanly", async () => {
  const { root, message } = createLoadingElements();
  const loading = new LoadingScreen(root, message);

  loading.show({
    variant: "ripple",
    message: "Dalgalar hazırlanıyor"
  });

  assert.equal(root.dataset.loaderVariant, "ripple");
  assert.equal(message.innerText, "Dalgalar hazırlanıyor");
  assert.equal(root.getAttribute("aria-busy"), "true");

  await loading.hide({ minimumMs: 0, transitionMs: 0 });

  assert.equal(root.classList.contains("active"), false);
  assert.equal(root.classList.contains("leaving"), false);
  assert.equal(root.getAttribute("aria-busy"), "false");
});

test("a newer loading request prevents an older hide from winning", async () => {
  const { root, message } = createLoadingElements();
  const loading = new LoadingScreen(root, message);

  loading.show({ variant: "shell", message: "İlk yükleme" });
  const pendingHide = loading.hide({ minimumMs: 5, transitionMs: 0 });
  loading.show({ variant: "channel", message: "Yeni yükleme" });

  await pendingHide;

  assert.equal(root.classList.contains("active"), true);
  assert.equal(root.dataset.loaderVariant, "channel");
  assert.equal(message.innerText, "Yeni yükleme");
});

test("unknown loading designs safely fall back to the shell", () => {
  const { root, message } = createLoadingElements();
  const loading = new LoadingScreen(root, message);

  loading.show({ variant: "unknown" });

  assert.equal(root.dataset.loaderVariant, "shell");
});
