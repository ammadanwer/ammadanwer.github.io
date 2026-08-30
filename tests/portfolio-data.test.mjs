import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const knowledge = JSON.parse(
  await readFile(new URL("../data/portfolio.json", import.meta.url), "utf8")
);
const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
const chatStyles = await readFile(
  new URL("../assets/css/ai-chat.css", import.meta.url),
  "utf8"
);
const chatConfig = await readFile(
  new URL("../assets/js/ai-chat-config.js", import.meta.url),
  "utf8"
);

function normalizeText(value) {
  return value
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const visiblePageText = normalizeText(page);

test("approved experience data stays aligned with the visible portfolio", () => {
  for (const role of knowledge.experience) {
    assert.ok(page.includes(role.company), `Missing company in page: ${role.company}`);
    assert.ok(page.includes(role.title), `Missing title in page: ${role.title}`);
    assert.ok(page.includes(role.period), `Missing period in page: ${role.period}`);
    for (const highlight of role.highlights) {
      assert.ok(
        visiblePageText.includes(normalizeText(highlight)),
        `Missing visible experience point for ${role.company}: ${highlight}`
      );
    }
  }
});

test("Staff AI Engineer is the canonical current title", () => {
  assert.equal(knowledge.person.headline, "Staff AI Engineer");
  assert.equal(knowledge.experience[0].title, "Staff AI Engineer");
  assert.match(page, /<title>Muhammad Ammad \| Staff AI Engineer<\/title>/);
  assert.doesNotMatch(page, /Staff AI platform engineer/i);
});

test("every approved skill is visible on the portfolio", () => {
  for (const skills of Object.values(knowledge.skills)) {
    for (const skill of skills) {
      assert.ok(visiblePageText.includes(skill), `Missing visible skill: ${skill}`);
    }
  }
});

test("every curated response is concise and retrievable", () => {
  for (const response of knowledge.responses) {
    assert.ok(response.id);
    assert.ok(response.keywords.length > 0, `${response.id} has no keywords`);
    assert.ok(response.text.split(/\s+/).length <= 65, `${response.id} is too long`);
    assert.match(
      response.text,
      /\b(?:I|I['’]m|I['’]ve|me|my)\b/i,
      `${response.id} is not written in first person`
    );
  }
});

test("all response links use an explicitly allowed public protocol", () => {
  const responses = [...knowledge.responses, knowledge.fallback];
  for (const response of responses) {
    for (const link of response.links ?? []) {
      assert.match(link.href, /^(https?:|mailto:|tel:)/);
    }
  }
});

test("the public page contains the disclosure and chat controls", () => {
  assert.match(page, /This is an AI representation, not the real Ammad/);
  assert.match(page, /synthetic clone of Ammad’s voice/);
  assert.match(page, /id="ai-chat-launcher"/);
  assert.match(page, /id="ai-chat-input"/);
  assert.match(page, /id="ai-chat-voice-toggle"/);
  assert.match(page, /Contact the real Ammad/);
});

test("the production chat config targets the exact Worker route with voice enabled", () => {
  assert.match(chatConfig, /voiceEnabled:\s*true/);
  assert.match(chatConfig, /mode:\s*"remote"/);
  assert.match(
    chatConfig,
    /endpoint:\s*"https:\/\/ammad-portfolio-ai\.ammad-anwer\.workers\.dev\/api\/chat"/
  );
});

test("the browser-rendered avatar is labelled, captioned, and motion-safe", () => {
  assert.match(page, /id="ai-avatar"/);
  assert.match(page, /aria-label="Browser-rendered AI avatar"/);
  assert.match(page, /data-avatar-status/);
  assert.match(page, /data-avatar-caption/);
  assert.match(page, /Every answer includes a text transcript below/);
  assert.match(chatStyles, /prefers-reduced-motion: reduce/);
  assert.match(chatStyles, /data-state="thinking"/);
  assert.match(chatStyles, /data-state="speaking"/);
});
