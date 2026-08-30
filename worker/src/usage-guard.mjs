import { HttpError, jsonResponse } from "./contracts.mjs";

const STORAGE_KEY = "usage-v1";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validLimit(value, maximum) {
  return Number.isInteger(value) && value > 0 && value <= maximum;
}

function validateConsumePayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !DAY_PATTERN.test(payload.day) ||
    !HASH_PATTERN.test(payload.sessionKey) ||
    typeof payload.countAiCall !== "boolean" ||
    typeof payload.countVoiceCall !== "boolean" ||
    !validLimit(payload.sessionLimit, 100) ||
    !validLimit(payload.dailyRequestLimit, 100_000) ||
    !validLimit(payload.dailyAiLimit, 100_000) ||
    !validLimit(payload.dailyVoiceLimit, 100_000)
  ) {
    throw new TypeError("Invalid usage request.");
  }
}

export class UsageGuard {
  constructor(context) {
    this.storage = context.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/consume") {
      return jsonResponse({ error: "Not found" }, { status: 404 });
    }

    let payload;
    try {
      payload = await request.json();
      validateConsumePayload(payload);
    } catch {
      return jsonResponse({ error: "Invalid request" }, { status: 400 });
    }

    let usage = await this.storage.get(STORAGE_KEY);
    if (!usage || usage.day !== payload.day) {
      usage = {
        day: payload.day,
        dailyRequests: 0,
        dailyAiCalls: 0,
        dailyVoiceCalls: 0,
        sessions: {}
      };
    }

    usage.dailyVoiceCalls ??= 0;

    const sessionCount = usage.sessions[payload.sessionKey] ?? 0;
    let reason = null;

    if (sessionCount >= payload.sessionLimit) reason = "session";
    else if (usage.dailyRequests >= payload.dailyRequestLimit) reason = "daily-requests";
    else if (payload.countAiCall && usage.dailyAiCalls >= payload.dailyAiLimit) {
      reason = "daily-ai";
    }

    if (reason) {
      return jsonResponse({ allowed: false, reason }, { status: 200 });
    }

    const voiceAllowed =
      !payload.countVoiceCall || usage.dailyVoiceCalls < payload.dailyVoiceLimit;

    usage.dailyRequests += 1;
    usage.dailyAiCalls += payload.countAiCall ? 1 : 0;
    usage.dailyVoiceCalls += payload.countVoiceCall && voiceAllowed ? 1 : 0;
    usage.sessions[payload.sessionKey] = sessionCount + 1;
    await this.storage.put(STORAGE_KEY, usage);

    return jsonResponse({
      allowed: true,
      voiceAllowed,
      remainingSession: Math.max(0, payload.sessionLimit - sessionCount - 1)
    });
  }
}

export async function consumeUsage(binding, payload) {
  if (!binding || typeof binding.idFromName !== "function") {
    throw new HttpError(
      503,
      "SERVICE_NOT_CONFIGURED",
      "The AI assistant is temporarily unavailable."
    );
  }

  try {
    const id = binding.idFromName("global-portfolio-usage");
    const stub = binding.get(id);
    const response = await stub.fetch("https://usage-guard.internal/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Usage guard rejected its internal request.");
    return await response.json();
  } catch {
    throw new HttpError(
      503,
      "USAGE_GUARD_UNAVAILABLE",
      "The AI assistant is temporarily unavailable."
    );
  }
}
