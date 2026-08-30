import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/index.mjs";

const allowedOrigin = "https://ammadanwer.github.io";
const sessionId = "0123456789abcdef0123456789abcdef";

function chatRequest(question, options = {}) {
  const payload = { question, sessionId };
  if (Object.hasOwn(options, "speak")) payload.speak = options.speak;

  return new Request("https://worker.example/api/chat", {
    method: options.method ?? "POST",
    headers: {
      Origin: options.origin ?? allowedOrigin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.10",
      ...options.headers
    },
    body:
      (options.method ?? "POST") === "POST"
        ? JSON.stringify(payload)
        : undefined
  });
}

function environment(overrides = {}) {
  const usageCalls = [];
  const rateKeys = [];
  let aiCalls = 0;
  const env = {
    AI_ENABLED: "true",
    AI_MODEL: "@cf/meta/llama-3.1-8b-instruct-fast",
    ALLOWED_ORIGINS: `${allowedOrigin},http://localhost:8000`,
    SESSION_REQUEST_LIMIT: "5",
    DAILY_REQUEST_LIMIT: "250",
    DAILY_AI_LIMIT: "50",
    REQUEST_TIMEOUT_MS: "15000",
    VOICE_ENABLED: "false",
    DAILY_VOICE_LIMIT: "20",
    VOICE_TIMEOUT_MS: "120000",
    RATE_LIMIT_SALT: "test-only-rate-limit-salt-with-more-than-32-characters",
    SESSION_BURST_LIMITER: {
      async limit({ key }) {
        rateKeys.push(key);
        return { success: true };
      }
    },
    NETWORK_BURST_LIMITER: {
      async limit({ key }) {
        rateKeys.push(key);
        return { success: true };
      }
    },
    USAGE_GUARD: {
      idFromName: (name) => name,
      get: () => ({
        async fetch(_url, init) {
          usageCalls.push(JSON.parse(init.body));
          return Response.json({ allowed: true, remainingSession: 4 });
        }
      })
    },
    AI: {
      async run() {
        aiCalls += 1;
        return {
          response: {
            text: "I build production AI agents, RAG systems, and research workflows.",
            links: [],
            emotion: "thoughtful"
          }
        };
      }
    },
    ...overrides
  };

  return {
    env,
    usageCalls,
    rateKeys,
    getAiCalls: () => aiCalls
  };
}

test("the chat handler returns grounded model output with exact CORS", async () => {
  const harness = environment();
  const response = await handleRequest(
    chatRequest("What kind of AI work has Ammad done?"),
    harness.env
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(payload.grounded, true);
  assert.equal(harness.getAiCalls(), 1);
  assert.equal(harness.usageCalls[0].countAiCall, true);
  assert.ok(harness.rateKeys.every((key) => !key.includes(sessionId)));
  assert.ok(harness.rateKeys.every((key) => !key.includes("203.0.113.10")));
});

test("unknown questions return the approved fallback without a model call", async () => {
  const harness = environment();
  const response = await handleRequest(
    chatRequest("What is Ammad's favourite restaurant?"),
    harness.env
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.sourceId, "fallback");
  assert.equal(harness.getAiCalls(), 0);
  assert.equal(harness.usageCalls[0].countAiCall, false);
});

test("the kill switch and exact-origin checks fail before provider work", async () => {
  const disabled = environment({ AI_ENABLED: "false" });
  const disabledResponse = await handleRequest(
    chatRequest("What does Ammad do?"),
    disabled.env
  );
  assert.equal(disabledResponse.status, 503);
  assert.equal((await disabledResponse.json()).error.code, "AI_DISABLED");
  assert.equal(disabled.getAiCalls(), 0);

  const denied = environment();
  const deniedResponse = await handleRequest(
    chatRequest("What does Ammad do?", { origin: `${allowedOrigin}.attacker.example` }),
    denied.env
  );
  assert.equal(deniedResponse.status, 403);
  assert.equal(deniedResponse.headers.get("access-control-allow-origin"), null);
  assert.equal(denied.getAiCalls(), 0);
});

test("preflight is narrow and unsupported methods are rejected", async () => {
  const harness = environment();
  const preflight = await handleRequest(
    chatRequest("", {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type"
      }
    }),
    harness.env
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-methods"), "POST, OPTIONS");

  const methodResponse = await handleRequest(
    chatRequest("", { method: "GET" }),
    harness.env
  );
  assert.equal(methodResponse.status, 405);
  assert.equal(methodResponse.headers.get("allow"), "POST, OPTIONS");
});

test("burst limiting maps to a safe 429 response", async () => {
  const harness = environment({
    SESSION_BURST_LIMITER: { limit: async () => ({ success: false }) }
  });
  const response = await handleRequest(
    chatRequest("What kind of AI work has Ammad done?"),
    harness.env
  );
  const payload = await response.json();

  assert.equal(response.status, 429);
  assert.equal(payload.error.code, "RATE_LIMITED");
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(harness.getAiCalls(), 0);
});

test("requested speech is authenticated through Modal and returned with the answer", async () => {
  let voiceRequest;
  const wav = new Uint8Array(64);
  wav.set(new TextEncoder().encode("RIFF"));
  const harness = environment({
    VOICE_ENABLED: "true",
    VOICE_ENDPOINT_URL: "https://ammad-voice.modal.run",
    MODAL_PROXY_KEY: "modal-key",
    MODAL_PROXY_SECRET: "modal-secret",
    VOICE_FETCH: async (url, init) => {
      voiceRequest = { url, init };
      return new Response(wav, {
        headers: {
          "Content-Type": "audio/wav",
          "X-Audio-Duration-Ms": "1850"
        }
      });
    }
  });

  const response = await handleRequest(
    chatRequest("What kind of AI work has Ammad done?", { speak: true }),
    harness.env
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.speech.mimeType, "audio/wav");
  assert.equal(payload.speech.durationMs, 1850);
  assert.ok(payload.speech.audioBase64);
  assert.equal(voiceRequest.url, "https://ammad-voice.modal.run/");
  assert.equal(voiceRequest.init.headers["Modal-Key"], "modal-key");
  assert.equal(voiceRequest.init.headers["Modal-Secret"], "modal-secret");
  assert.deepEqual(JSON.parse(voiceRequest.init.body), { text: payload.text });
  assert.equal(harness.usageCalls[0].countVoiceCall, true);
});

test("voice failures degrade to the validated text answer", async () => {
  const harness = environment({
    VOICE_ENABLED: "true",
    VOICE_ENDPOINT_URL: "https://ammad-voice.modal.run",
    MODAL_PROXY_KEY: "modal-key",
    MODAL_PROXY_SECRET: "modal-secret",
    VOICE_FETCH: async () => new Response("unavailable", { status: 503 })
  });

  const response = await handleRequest(
    chatRequest("What kind of AI work has Ammad done?", { speak: true }),
    harness.env
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.match(payload.text, /production AI agents/i);
  assert.equal(payload.speech, undefined);
  assert.equal(payload.speechUnavailable, true);
});
