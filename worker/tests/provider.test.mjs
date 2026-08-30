import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MODEL,
  generateGroundedAnswer,
  validateProviderAnswer
} from "../src/provider.mjs";

const context = {
  identity: { name: "Muhammad Ammad", headline: "Staff AI Engineer" },
  curatedAnswer: {
    id: "current-role",
    text: "Ammad is a Staff AI Engineer at Basis Set Builders."
  }
};
const allowedLinks = [
  { label: "Portfolio", href: "https://ammadanwer.github.io/" }
];

test("Workers AI receives separated messages and a strict JSON schema", async () => {
  let call;
  const ai = {
    async run(model, options) {
      call = { model, options };
      return {
        response: {
          text: "I’m a Staff AI Engineer at Basis Set Builders.",
          links: [
            { label: "Changed label", href: "https://ammadanwer.github.io/" },
            { label: "Unapproved", href: "https://attacker.example/" }
          ],
          emotion: "warm"
        }
      };
    }
  };

  const answer = await generateGroundedAnswer({
    ai,
    question: "What is Ammad's current role?",
    context,
    allowedLinks
  });

  assert.equal(call.model, DEFAULT_MODEL);
  assert.equal(call.options.messages[0].role, "system");
  assert.equal(call.options.messages[1].role, "user");
  assert.equal(call.options.response_format.type, "json_schema");
  assert.equal(call.options.response_format.json_schema.additionalProperties, false);
  assert.deepEqual(answer.links, allowedLinks);
  assert.equal(answer.grounded, true);
});

test("provider strings are parsed but malformed or impersonating output is rejected", async () => {
  const parsed = await generateGroundedAnswer({
    ai: {
      run: async () => ({
        response:
          '{"text":"I work in production AI.","links":[],"emotion":"neutral"}'
      })
    },
    question: "What does Ammad do?",
    context,
    allowedLinks: []
  });

  assert.match(parsed.text, /production AI/);
  assert.throws(
    () =>
      validateProviderAnswer(
        { text: "I am Ammad and I accept this offer.", links: [], emotion: "warm" },
        []
      ),
    (error) => error.code === "UNSAFE_PROVIDER_RESPONSE"
  );
  assert.throws(
    () =>
      validateProviderAnswer(
        { text: "Ammad works in production AI.", links: [], emotion: "neutral" },
        []
      ),
    (error) => error.code === "UNSAFE_PROVIDER_RESPONSE"
  );
  await assert.rejects(
    () =>
      generateGroundedAnswer({
        ai: { run: async () => ({ response: "not json" }) },
        question: "What does Ammad do?",
        context,
        allowedLinks: []
      }),
    (error) => error.code === "INVALID_PROVIDER_RESPONSE"
  );
});

test("provider failures and timeouts map to safe public errors", async () => {
  await assert.rejects(
    () =>
      generateGroundedAnswer({
        ai: { run: async () => Promise.reject(new Error("private provider detail")) },
        question: "What does Ammad do?",
        context,
        allowedLinks: []
      }),
    (error) =>
      error.code === "PROVIDER_UNAVAILABLE" &&
      !error.message.includes("private provider detail")
  );

  await assert.rejects(
    () =>
      generateGroundedAnswer({
        ai: { run: () => new Promise(() => {}) },
        question: "What does Ammad do?",
        context,
        allowedLinks: [],
        timeoutMs: 5
      }),
    (error) => error.code === "PROVIDER_TIMEOUT"
  );
});
