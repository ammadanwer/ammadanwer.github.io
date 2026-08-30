import assert from "node:assert/strict";
import test from "node:test";

import {
  AudioPlaybackError,
  AvatarAudioPlayer,
  decodeBase64Audio
} from "../assets/js/audio-player.mjs";

function encodedWav() {
  const bytes = new Uint8Array(64);
  bytes.set(new TextEncoder().encode("RIFF"));
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return btoa(String.fromCharCode(...bytes));
}

function harness(options = {}) {
  const frames = [];
  const cancelledFrames = [];
  const mouthLevels = [];
  const source = {
    started: false,
    stopped: false,
    connect() {},
    disconnect() {},
    start() {
      this.started = true;
    },
    stop() {
      this.stopped = true;
    },
    onended: null
  };
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    connect() {},
    disconnect() {},
    getByteTimeDomainData(values) {
      values.fill(128);
      values[0] = 192;
    }
  };
  const context = {
    state: "suspended",
    destination: {},
    async resume() {
      this.state = "running";
    },
    async decodeAudioData(buffer) {
      assert.ok(buffer.byteLength >= 44);
      return { duration: 1.5 };
    },
    createBufferSource: () => source,
    createAnalyser: () => analyser,
    async close() {
      this.state = "closed";
    }
  };
  const avatar = {
    reducedMotion: options.reducedMotion ?? false,
    began: null,
    finished: 0,
    beginAudioDrivenSpeech(caption, emotion) {
      this.began = { caption, emotion };
    },
    setMouthLevel(level) {
      mouthLevels.push(level);
    },
    finishAudioDrivenSpeech() {
      this.finished += 1;
    }
  };
  const player = new AvatarAudioPlayer(avatar, {
    createContext: () => context,
    requestFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelFrame: (id) => cancelledFrames.push(id)
  });

  return {
    player,
    avatar,
    context,
    source,
    frames,
    cancelledFrames,
    mouthLevels
  };
}

test("base64 WAV data is decoded with strict bounds", () => {
  assert.equal(decodeBase64Audio(encodedWav()).byteLength, 64);
  assert.throws(
    () => decodeBase64Audio("not base64"),
    (error) => error instanceof AudioPlaybackError && error.code === "INVALID_AUDIO"
  );
});

test("playback unlocks audio and drives avatar mouth amplitude", async () => {
  const { player, avatar, context, source, frames, mouthLevels } = harness();
  const started = await player.play(
    { mimeType: "audio/wav", audioBase64: encodedWav() },
    { caption: "I build grounded AI systems.", emotion: "thoughtful" }
  );

  assert.equal(started, true);
  assert.equal(context.state, "running");
  assert.equal(source.started, true);
  assert.deepEqual(avatar.began, {
    caption: "I build grounded AI systems.",
    emotion: "thoughtful"
  });
  assert.equal(frames.length, 1);

  frames[0]();
  assert.ok(mouthLevels[0] > 0);

  source.onended();
  assert.equal(avatar.finished, 1);
});

test("reduced motion keeps audio but skips continuous mouth frames", async () => {
  const { player, source, frames } = harness({ reducedMotion: true });

  await player.play(
    { mimeType: "audio/wav", audioBase64: encodedWav() },
    { caption: "A captioned answer.", emotion: "neutral" }
  );

  assert.equal(source.started, true);
  assert.equal(frames.length, 0);
});
