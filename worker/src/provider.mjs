import { HttpError } from "./contracts.mjs";
import { buildGroundedMessages } from "./grounding.mjs";

export const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MAX_ANSWER_CHARACTERS = 700;

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", minLength: 1, maxLength: MAX_ANSWER_CHARACTERS },
    links: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string", minLength: 1, maxLength: 80 },
          href: { type: "string", minLength: 1, maxLength: 300 }
        },
        required: ["label", "href"]
      }
    },
    emotion: {
      type: "string",
      enum: ["neutral", "warm", "enthusiastic", "thoughtful"]
    }
  },
  required: ["text", "links", "emotion"]
};

function providerFailure(status, code, message) {
  return new HttpError(status, code, message);
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        providerFailure(
          504,
          "PROVIDER_TIMEOUT",
          "The AI assistant took too long to respond. Please try again."
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseProviderAnswer(result) {
  let candidate = result?.response ?? result;

  if (typeof candidate === "string") {
    const withoutFence = candidate
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    try {
      candidate = JSON.parse(withoutFence);
    } catch {
      throw providerFailure(
        502,
        "INVALID_PROVIDER_RESPONSE",
        "The AI assistant returned an invalid response. Please try again."
      );
    }
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw providerFailure(
      502,
      "INVALID_PROVIDER_RESPONSE",
      "The AI assistant returned an invalid response. Please try again."
    );
  }

  return candidate;
}

export function validateProviderAnswer(candidate, allowedLinks = []) {
  const allowedLinkMap = new Map(
    allowedLinks.map((link) => [link.href, { label: link.label, href: link.href }])
  );
  const text =
    typeof candidate.text === "string"
      ? candidate.text.trim().replace(/\s+/g, " ")
      : "";

  if (!text || text.length > MAX_ANSWER_CHARACTERS) {
    throw providerFailure(
      502,
      "INVALID_PROVIDER_RESPONSE",
      "The AI assistant returned an invalid response. Please try again."
    );
  }

  const usesFirstPerson = /\b(?:i|i['’]m|i['’]ve|me|my)\b/i.test(text);
  const impersonatesOrCommits =
    /\b(i am|i['’]m) (?:the (?:live|real) )?(?:muhammad )?ammad\b|\bi (accept|promise|agree to|commit|authorize|guarantee)\b/i.test(
      text
    );

  if (!usesFirstPerson || impersonatesOrCommits) {
    throw providerFailure(
      502,
      "UNSAFE_PROVIDER_RESPONSE",
      "The AI assistant could not produce a safe response. Please try again."
    );
  }

  const links = [];
  const seen = new Set();
  for (const link of Array.isArray(candidate.links) ? candidate.links : []) {
    const approved = allowedLinkMap.get(link?.href);
    if (approved && !seen.has(approved.href)) {
      links.push(approved);
      seen.add(approved.href);
    }
  }

  const allowedEmotions = new Set(["neutral", "warm", "enthusiastic", "thoughtful"]);

  return {
    text,
    links,
    emotion: allowedEmotions.has(candidate.emotion) ? candidate.emotion : "neutral",
    grounded: true,
    sourceId: "workers-ai"
  };
}

export async function generateGroundedAnswer(options) {
  const { ai, question, context, allowedLinks = [] } = options;
  if (!ai || typeof ai.run !== "function") {
    throw providerFailure(
      503,
      "SERVICE_NOT_CONFIGURED",
      "The AI assistant is temporarily unavailable."
    );
  }

  const model = options.model || DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let result;

  try {
    result = await withTimeout(
      ai.run(model, {
        messages: buildGroundedMessages(question, context, allowedLinks),
        response_format: {
          type: "json_schema",
          json_schema: ANSWER_SCHEMA
        },
        max_tokens: 180,
        temperature: 0.15,
        stream: false
      }),
      timeoutMs
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw providerFailure(
      502,
      "PROVIDER_UNAVAILABLE",
      "The AI assistant is temporarily unavailable. Please try again."
    );
  }

  return validateProviderAnswer(parseProviderAnswer(result), allowedLinks);
}
