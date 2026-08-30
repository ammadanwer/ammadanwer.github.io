import assert from "node:assert/strict";
import test from "node:test";

import {
  isVoiceConfigured,
  synthesizeSpeech
} from "../src/voice.mjs";

function wavBytes(length = 64) {
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode("RIFF"));
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return bytes;
}

test("voice configuration requires the kill switch and every private value", () => {
  const complete = {
    VOICE_ENABLED: "true",
    VOICE_ENDPOINT_URL: "https://voice.modal.run",
    MODAL_PROXY_KEY: "key",
    MODAL_PROXY_SECRET: "secret"
  };

  assert.equal(isVoiceConfigured(complete), true);
  assert.equal(isVoiceConfigured({ ...complete, VOICE_ENABLED: "false" }), false);
  assert.equal(isVoiceConfigured({ ...complete, MODAL_PROXY_SECRET: "" }), false);
});

test("the Modal request uses proxy headers and returns bounded WAV data", async () => {
  let request;
  const speech = await synthesizeSpeech({
    text: "I live in Melbourne and build grounded AI systems.",
    endpoint: "https://voice.modal.run/synthesize",
    proxyKey: "key",
    proxySecret: "secret",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(wavBytes(), {
        headers: {
          "Content-Type": "audio/wav; charset=binary",
          "X-Audio-Duration-Ms": "2400"
        }
      });
    }
  });

  assert.equal(request.init.headers["Modal-Key"], "key");
  assert.equal(request.init.headers["Modal-Secret"], "secret");
  assert.deepEqual(JSON.parse(request.init.body), {
    text: "I live in Melburn and build grounded AI systems."
  });
  assert.equal(speech.mimeType, "audio/wav");
  assert.equal(speech.durationMs, 2400);
  assert.ok(speech.audioBase64.length > 44);
});

test("invalid or oversized upstream audio is rejected safely", async () => {
  const base = {
    text: "I build grounded AI systems.",
    endpoint: "https://voice.modal.run/synthesize",
    proxyKey: "key",
    proxySecret: "secret"
  };

  await assert.rejects(
    () =>
      synthesizeSpeech({
        ...base,
        fetchImpl: async () =>
          new Response("not audio", { headers: { "Content-Type": "text/plain" } })
      }),
    (error) => error.code === "INVALID_VOICE_RESPONSE"
  );
  await assert.rejects(
    () =>
      synthesizeSpeech({
        ...base,
        maxAudioBytes: 48,
        fetchImpl: async () =>
          new Response(wavBytes(64), { headers: { "Content-Type": "audio/wav" } })
      }),
    (error) => error.code === "VOICE_RESPONSE_TOO_LARGE"
  );
});
