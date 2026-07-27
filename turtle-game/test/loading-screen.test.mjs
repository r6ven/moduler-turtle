import assert from "node:assert/strict";
import test from "node:test";

import { LoadingScreen } from "../src/LoadingScreen.js";
import { LoadingTurtleAnimator } from "../src/LoadingTurtleAnimator.js";

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

test("loading turtles reuse the in-game geometric renderer", () => {
  let scheduledFrame = null;
  let nextFrameId = 0;

  window.devicePixelRatio = 2;
  window.matchMedia = () => ({ matches: false });
  window.requestAnimationFrame = (callback) => {
    scheduledFrame = callback;
    nextFrameId += 1;
    return nextFrameId;
  };
  window.cancelAnimationFrame = () => {};

  const calls = [];
  const ctx = {
    setTransform() {},
    clearRect() {},
    save() {},
    translate() {},
    scale() {},
    restore() {}
  };
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: 108,
    clientHeight: 128,
    getBoundingClientRect: () => ({ width: 108, height: 128 }),
    getContext: () => ctx
  };
  const animator = new LoadingTurtleAnimator({
    querySelectorAll: () => [canvas]
  });

  animator.renderer.drawGeometricTurtle = (drawingContext, turtle) => {
    calls.push({ drawingContext, turtle });
  };
  scheduledFrame(animator.startedAt + 100);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].drawingContext, ctx);
  assert.equal(calls[0].turtle.motionBlend, 0.82);
  assert.equal(canvas.width, 216);
  assert.equal(canvas.height, 256);

  animator.stop();
});