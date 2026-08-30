import assert from "node:assert/strict";
import test from "node:test";

import { UsageGuard } from "../src/usage-guard.mjs";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    const value = this.values.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  async put(key, value) {
    this.values.set(key, structuredClone(value));
  }
}

const sessionA = "a".repeat(64);
const sessionB = "b".repeat(64);
const sessionC = "c".repeat(64);

async function consume(guard, overrides = {}) {
  const payload = {
    day: "2026-08-24",
    sessionKey: sessionA,
    countAiCall: true,
    countVoiceCall: false,
    sessionLimit: 5,
    dailyRequestLimit: 250,
    dailyAiLimit: 50,
    dailyVoiceLimit: 20,
    ...overrides
  };
  const response = await guard.fetch(
    new Request("https://usage-guard.internal/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );
  return response.json();
}

test("the Durable Object enforces the exact browser-session limit", async () => {
  const guard = new UsageGuard({ storage: new MemoryStorage() });

  assert.equal((await consume(guard, { sessionLimit: 2 })).allowed, true);
  assert.equal((await consume(guard, { sessionLimit: 2 })).allowed, true);
  assert.deepEqual(await consume(guard, { sessionLimit: 2 }), {
    allowed: false,
    reason: "session"
  });
});

test("deterministic answers do not consume the model-call budget", async () => {
  const guard = new UsageGuard({ storage: new MemoryStorage() });

  assert.equal(
    (await consume(guard, { sessionKey: sessionA, countAiCall: false, dailyAiLimit: 1 }))
      .allowed,
    true
  );
  assert.equal(
    (await consume(guard, { sessionKey: sessionB, countAiCall: true, dailyAiLimit: 1 }))
      .allowed,
    true
  );
  assert.deepEqual(
    await consume(guard, { sessionKey: sessionC, countAiCall: true, dailyAiLimit: 1 }),
    { allowed: false, reason: "daily-ai" }
  );
  assert.equal(
    (await consume(guard, { sessionKey: sessionC, countAiCall: false, dailyAiLimit: 1 }))
      .allowed,
    true
  );
});

test("the usage ledger resets on a new UTC day", async () => {
  const guard = new UsageGuard({ storage: new MemoryStorage() });

  await consume(guard, { sessionLimit: 1 });
  assert.equal((await consume(guard, { sessionLimit: 1 })).reason, "session");
  assert.equal(
    (await consume(guard, { day: "2026-08-25", sessionLimit: 1 })).allowed,
    true
  );
});

test("the voice budget degrades independently without blocking text answers", async () => {
  const guard = new UsageGuard({ storage: new MemoryStorage() });

  const first = await consume(guard, {
    sessionKey: sessionA,
    countAiCall: false,
    countVoiceCall: true,
    dailyVoiceLimit: 1
  });
  const second = await consume(guard, {
    sessionKey: sessionB,
    countAiCall: false,
    countVoiceCall: true,
    dailyVoiceLimit: 1
  });

  assert.equal(first.allowed, true);
  assert.equal(first.voiceAllowed, true);
  assert.equal(second.allowed, true);
  assert.equal(second.voiceAllowed, false);
});
