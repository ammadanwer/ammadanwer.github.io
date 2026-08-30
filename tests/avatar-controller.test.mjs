import assert from "node:assert/strict";
import test from "node:test";

import {
  AVATAR_STATES,
  AvatarController
} from "../assets/js/avatar-controller.mjs";

function harness(options = {}) {
  const scheduled = [];
  const cancelled = [];
  const properties = new Map();
  const status = { textContent: "" };
  const caption = { textContent: "" };
  const root = {
    dataset: {},
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name)
    },
    querySelector(selector) {
      return selector === "[data-avatar-status]" ? status : caption;
    }
  };
  const controller = new AvatarController(root, {
    reducedMotion: options.reducedMotion ?? false,
    schedule(callback, delay) {
      const id = scheduled.length + 1;
      scheduled.push({ id, callback, delay });
      return id;
    },
    cancel: (id) => cancelled.push(id)
  });

  return { root, status, caption, controller, scheduled, cancelled, properties };
}

test("the avatar exposes every supported state with accessible labels", () => {
  const { controller, root, status } = harness();

  for (const state of AVATAR_STATES) {
    controller.setState(state);
    assert.equal(root.dataset.state, state);
    assert.ok(status.textContent);
  }

  assert.throws(() => controller.setState("unsupported"), /Unsupported avatar state/);
});

test("an answer drives a bounded speaking state and keeps its transcript", () => {
  const { controller, root, status, caption, scheduled } = harness();
  const answer = "I build production AI agents and grounded retrieval systems.";
  const duration = controller.presentAnswer(answer, "warm");

  assert.equal(root.dataset.state, "speaking");
  assert.equal(root.dataset.emotion, "warm");
  assert.equal(status.textContent, "Sharing an answer");
  assert.equal(caption.textContent, answer);
  assert.ok(duration >= 1_400 && duration <= 4_800);
  assert.equal(scheduled.at(-1).delay, duration);

  scheduled.at(-1).callback();
  assert.equal(root.dataset.state, "idle");
});

test("reduced motion keeps state information without prolonged animation", () => {
  const { controller, root, status, scheduled } = harness({ reducedMotion: true });
  const duration = controller.presentAnswer("A short answer.", "enthusiastic");

  assert.equal(root.dataset.reducedMotion, "true");
  assert.equal(root.dataset.state, "speaking");
  assert.equal(status.textContent, "Answer ready");
  assert.equal(duration, 1_200);
  assert.equal(scheduled.at(-1).delay, 1_200);
});

test("future audio playback can drive mouth amplitude directly", () => {
  const { controller, root, properties } = harness();

  controller.beginAudioDrivenSpeech("Captioned answer", "thoughtful");
  controller.setMouthLevel(0.75);

  assert.equal(root.dataset.audioDriven, "true");
  assert.equal(root.dataset.state, "speaking");
  assert.equal(Number(properties.get("--avatar-mouth-open")), 0.7875);

  controller.finishAudioDrivenSpeech();
  assert.equal(root.dataset.state, "idle");
  assert.equal(properties.has("--avatar-mouth-open"), false);
});
