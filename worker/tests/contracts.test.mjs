import assert from "node:assert/strict";
import test from "node:test";

import {
  HttpError,
  parseAllowedOrigins,
  readChatRequest,
  requireAllowedOrigin
} from "../src/contracts.mjs";

function chatRequest(body, headers = {}) {
  return new Request("https://worker.example/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

test("the Worker request contract normalizes the exact allowed shape", async () => {
  const parsed = await readChatRequest(
    chatRequest({
      question: "  What   does Ammad do?  ",
      sessionId: "0123456789abcdef"
    })
  );

  assert.deepEqual(parsed, {
    question: "What does Ammad do?",
    sessionId: "0123456789abcdef",
    speak: false
  });

  const withSpeech = await readChatRequest(
    chatRequest({
      question: "What does Ammad do?",
      sessionId: "0123456789abcdef",
      speak: true
    })
  );
  assert.equal(withSpeech.speak, true);
});

test("the Worker rejects unknown fields, invalid sessions, and non-JSON content", async () => {
  await assert.rejects(
    () =>
      readChatRequest(
        chatRequest({
          question: "Hello?",
          sessionId: "0123456789abcdef",
          messages: []
        })
      ),
    (error) => error instanceof HttpError && error.code === "INVALID_REQUEST"
  );
  await assert.rejects(
    () => readChatRequest(chatRequest({ question: "Hello?", sessionId: "short" })),
    (error) => error.code === "INVALID_SESSION"
  );
  await assert.rejects(
    () =>
      readChatRequest(
        chatRequest({
          question: "Hello?",
          sessionId: "0123456789abcdef",
          speak: "yes"
        })
      ),
    (error) => error.code === "INVALID_SPEECH_SETTING"
  );
  await assert.rejects(
    () =>
      readChatRequest(
        new Request("https://worker.example/api/chat", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "hello"
        })
      ),
    (error) => error.code === "UNSUPPORTED_MEDIA_TYPE"
  );
});

test("the Worker enforces both request bytes and question length", async () => {
  await assert.rejects(
    () =>
      readChatRequest(
        chatRequest({
          question: "x".repeat(501),
          sessionId: "0123456789abcdef"
        })
      ),
    (error) => error.code === "QUESTION_TOO_LONG"
  );
  await assert.rejects(
    () =>
      readChatRequest(
        chatRequest({
          question: "x".repeat(100),
          sessionId: "0123456789abcdef"
        }),
        { maxRequestBytes: 32 }
      ),
    (error) => error.code === "REQUEST_TOO_LARGE"
  );
});

test("CORS origins are exact and missing origins fail closed", () => {
  const origins = parseAllowedOrigins(
    "https://ammadanwer.github.io,http://localhost:8000"
  );
  const allowed = new Request("https://worker.example/api/chat", {
    headers: { Origin: "https://ammadanwer.github.io" }
  });
  const lookalike = new Request("https://worker.example/api/chat", {
    headers: { Origin: "https://ammadanwer.github.io.attacker.example" }
  });

  assert.equal(
    requireAllowedOrigin(allowed, origins),
    "https://ammadanwer.github.io"
  );
  assert.throws(
    () => requireAllowedOrigin(lookalike, origins),
    (error) => error.code === "ORIGIN_NOT_ALLOWED"
  );
  assert.throws(
    () => requireAllowedOrigin(new Request("https://worker.example/api/chat"), origins),
    (error) => error.code === "ORIGIN_NOT_ALLOWED"
  );
});
