import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ChatAdapterError,
  SessionQuestionLimit,
  createLocalChatAdapter,
  createRemoteChatAdapter,
  getOrCreateSessionId,
  validateQuestion
} from "../assets/js/chat-adapter.mjs";

const knowledge = JSON.parse(
  await readFile(new URL("../data/portfolio.json", import.meta.url), "utf8")
);

test("question validation trims whitespace and enforces the configured length", () => {
  assert.equal(validateQuestion("  What   does Ammad do?  "), "What does Ammad do?");
  assert.throws(() => validateQuestion("   "), ChatAdapterError);
  assert.throws(
    () => validateQuestion("x".repeat(501)),
    (error) => error.code === "QUESTION_TOO_LONG"
  );
});

test("AI questions return only the approved AI summary", async () => {
  const adapter = createLocalChatAdapter(knowledge, { delayMs: 0 });
  const answer = await adapter.ask("What kind of AI work has Ammad done?");

  assert.equal(answer.sourceId, "ai");
  assert.match(answer.text, /production AI agents/i);
  assert.equal(answer.grounded, true);
});

test("new resume-specific questions retrieve the consolidated facts", async () => {
  const adapter = createLocalChatAdapter(knowledge, { delayMs: 0 });
  const productAnswer = await adapter.ask("What did Ammad build as the first technical hire?");
  const safetyAnswer = await adapter.ask("How does Ammad approach AI safety and evaluation?");
  const platformAnswer = await adapter.ask("Tell me about the Slack agent platform and DBOS");

  assert.equal(productAnswer.sourceId, "sourcer");
  assert.match(productAnswer.text, /built Sourcer from scratch/i);
  assert.equal(safetyAnswer.sourceId, "ai-safety-evaluation");
  assert.match(safetyAnswer.text, /golden evaluations/i);
  assert.equal(platformAnswer.sourceId, "agent-platform");
  assert.match(platformAnswer.text, /durable checkpoints/i);
});

test("data engineering and contact questions select their relevant facts", async () => {
  const adapter = createLocalChatAdapter(knowledge, { delayMs: 0 });
  const dataAnswer = await adapter.ask("Tell me about Ammad's data engineering background");
  const contactAnswer = await adapter.ask("How can I contact Ammad?");
  const locationAnswer = await adapter.ask("Where does Ammad live?");

  assert.equal(dataAnswer.sourceId, "data-engineering");
  assert.match(dataAnswer.text, /Airflow/);
  assert.equal(contactAnswer.sourceId, "contact");
  assert.ok(contactAnswer.links.some((link) => link.href.startsWith("mailto:")));
  assert.equal(locationAnswer.sourceId, "location");
  assert.match(locationAnswer.text, /^I live in Melbourne, Australia\./);
});

test("unknown questions use the explicit verified-information fallback", async () => {
  const adapter = createLocalChatAdapter(knowledge, { delayMs: 0 });
  const answer = await adapter.ask("What is Ammad's favourite restaurant?");

  assert.equal(answer.sourceId, "fallback");
  assert.equal(answer.text, knowledge.fallback.text);
});

test("the assistant refuses to negotiate or commit on Ammad's behalf", async () => {
  const adapter = createLocalChatAdapter(knowledge, { delayMs: 0 });
  const answer = await adapter.ask("What is Ammad's salary in his current role?");

  assert.equal(answer.sourceId, "commitments");
  assert.match(answer.text, /can’t negotiate/i);
});

test("listed skills can be confirmed without inferring a proficiency level", async () => {
  const adapter = createLocalChatAdapter(knowledge, { delayMs: 0 });
  const answer = await adapter.ask("Does Ammad have experience with Git?");

  assert.equal(answer.sourceId, "verified-skills");
  assert.match(answer.text, /listed Git/);
  assert.match(answer.text, /don’t have more verified detail/);
});

test("unknown skills and personal opinions use the fallback", async () => {
  const adapter = createLocalChatAdapter(knowledge, { delayMs: 0 });
  const unknownSkill = await adapter.ask("Does Ammad have experience with Rust?");
  const opinion = await adapter.ask("What does Ammad think about AI regulation?");

  assert.equal(unknownSkill.sourceId, "fallback");
  assert.equal(opinion.sourceId, "fallback");
});

test("every suggested question resolves to an approved response", async () => {
  const adapter = createLocalChatAdapter(knowledge, { delayMs: 0 });

  for (const question of knowledge.suggestedQuestions) {
    const answer = await adapter.ask(question);
    assert.notEqual(answer.sourceId, "fallback", question);
  }
});

test("the session limiter allows exactly the configured number of questions", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const limiter = new SessionQuestionLimit(storage, { maximum: 2 });

  assert.equal(limiter.remaining(), 2);
  assert.equal(limiter.consume(), 1);
  assert.equal(limiter.consume(), 0);
  assert.throws(() => limiter.consume(), (error) => error.code === "SESSION_LIMIT");
});

test("the session limiter still works when browser storage is unavailable", () => {
  const blockedStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    }
  };
  const limiter = new SessionQuestionLimit(blockedStorage, { maximum: 1 });

  limiter.consume();
  assert.equal(limiter.remaining(), 0);
  assert.throws(() => limiter.consume(), (error) => error.code === "SESSION_LIMIT");
});

test("the remote adapter sends only the question and random browser session ID", async () => {
  let capturedRequest;
  const adapter = createRemoteChatAdapter("https://ai.example.com/api/chat", {
    sessionId: "0123456789abcdef0123456789abcdef",
    fetchImpl: async (url, init) => {
      capturedRequest = { url, init };
      return Response.json({
        text: "I build grounded AI systems.",
        links: [{ label: "Portfolio", href: "https://ammadanwer.github.io/" }],
        emotion: "warm",
        grounded: true
      });
    }
  });

  const answer = await adapter.ask("  What   does Ammad build? ");

  assert.equal(capturedRequest.url, "https://ai.example.com/api/chat");
  assert.equal(capturedRequest.init.method, "POST");
  assert.deepEqual(JSON.parse(capturedRequest.init.body), {
    question: "What does Ammad build?",
    sessionId: "0123456789abcdef0123456789abcdef"
  });
  assert.equal(answer.emotion, "warm");
  assert.equal(answer.grounded, true);
});

test("the remote adapter exposes only safe server errors", async () => {
  const adapter = createRemoteChatAdapter("http://localhost:8787/api/chat", {
    sessionId: "0123456789abcdef0123456789abcdef",
    fetchImpl: async () =>
      Response.json(
        { error: { code: "SESSION_LIMIT", message: "Session limit reached." } },
        { status: 429 }
      )
  });

  await assert.rejects(
    () => adapter.ask("What does Ammad do?"),
    (error) =>
      error instanceof ChatAdapterError &&
      error.code === "SESSION_LIMIT" &&
      error.message === "Session limit reached."
  );
  assert.throws(
    () =>
      createRemoteChatAdapter("http://insecure.example.com/api/chat", {
        sessionId: "0123456789abcdef0123456789abcdef"
      }),
    (error) => error.code === "INVALID_REMOTE_ENDPOINT"
  );
});

test("the remote adapter requests and validates optional speech", async () => {
  let requestBody;
  const bytes = new Uint8Array(64);
  bytes.set(new TextEncoder().encode("RIFF"));
  const audioBase64 = btoa(String.fromCharCode(...bytes));
  const adapter = createRemoteChatAdapter("https://ai.example.com/api/chat", {
    sessionId: "0123456789abcdef0123456789abcdef",
    speechEnabled: () => true,
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return Response.json({
        text: "I build grounded AI systems.",
        links: [],
        emotion: "thoughtful",
        grounded: true,
        speech: { mimeType: "audio/wav", audioBase64, durationMs: 1900 }
      });
    }
  });

  const answer = await adapter.ask("What do you build?");

  assert.equal(requestBody.speak, true);
  assert.equal(answer.speech.mimeType, "audio/wav");
  assert.equal(answer.speech.durationMs, 1900);
  assert.equal(answer.speechUnavailable, false);
});

test("malformed optional speech does not discard a valid text answer", async () => {
  const adapter = createRemoteChatAdapter("https://ai.example.com/api/chat", {
    sessionId: "0123456789abcdef0123456789abcdef",
    speechEnabled: true,
    fetchImpl: async () =>
      Response.json({
        text: "I build grounded AI systems.",
        links: [],
        emotion: "neutral",
        grounded: true,
        speech: { mimeType: "audio/wav", audioBase64: "invalid" }
      })
  });

  const answer = await adapter.ask("What do you build?");
  assert.equal(answer.text, "I build grounded AI systems.");
  assert.equal(answer.speech, undefined);
  assert.equal(answer.speechUnavailable, true);
});

test("browser session IDs are cryptographically generated and reused", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const cryptoSource = {
    getRandomValues(array) {
      array.fill(7);
      return array;
    }
  };

  const first = getOrCreateSessionId(storage, cryptoSource);
  const second = getOrCreateSessionId(storage, {
    getRandomValues() {
      throw new Error("A stored value should be reused.");
    }
  });

  assert.equal(first, "07".repeat(16));
  assert.equal(second, first);
});
