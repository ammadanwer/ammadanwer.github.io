import portfolio from "../../data/portfolio.json" with { type: "json" };

import {
  HttpError,
  corsHeaders,
  jsonResponse,
  parseAllowedOrigins,
  readChatRequest,
  readIntegerSetting,
  requireAllowedOrigin
} from "./contracts.mjs";
import { retrieveKnowledge } from "./grounding.mjs";
import { generateGroundedAnswer } from "./provider.mjs";
import { deriveAbuseKeys } from "./security.mjs";
import { UsageGuard, consumeUsage } from "./usage-guard.mjs";
import { isVoiceConfigured, synthesizeSpeech } from "./voice.mjs";

const CHAT_PATH = "/api/chat";
const HEALTH_PATH = "/health";

function errorResponse(error, requestId, origin, extraHeaders = {}) {
  const safeError =
    error instanceof HttpError
      ? error
      : new HttpError(
          500,
          "INTERNAL_ERROR",
          "The AI assistant is temporarily unavailable."
        );
  const headers = {
    ...extraHeaders,
    ...(origin ? corsHeaders(origin) : {}),
    "X-Request-ID": requestId
  };

  return jsonResponse(
    {
      error: { code: safeError.code, message: safeError.message },
      requestId
    },
    { status: safeError.status, headers }
  );
}

function validatePreflight(request) {
  const requestedMethod = request.headers.get("access-control-request-method");
  if (requestedMethod && requestedMethod.toUpperCase() !== "POST") {
    throw new HttpError(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
  }

  const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (requestedHeaders.some((header) => header !== "content-type")) {
    throw new HttpError(
      400,
      "HEADERS_NOT_ALLOWED",
      "The preflight requested unsupported headers."
    );
  }
}

async function enforceBurstLimits(env, sessionKey, networkKey) {
  if (
    !env.SESSION_BURST_LIMITER?.limit ||
    !env.NETWORK_BURST_LIMITER?.limit
  ) {
    throw new HttpError(
      503,
      "SERVICE_NOT_CONFIGURED",
      "The AI assistant is temporarily unavailable."
    );
  }

  try {
    const [sessionResult, networkResult] = await Promise.all([
      env.SESSION_BURST_LIMITER.limit({ key: `session:${sessionKey}` }),
      env.NETWORK_BURST_LIMITER.limit({ key: `network:${networkKey}` })
    ]);

    if (!sessionResult.success || !networkResult.success) {
      throw new HttpError(
        429,
        "RATE_LIMITED",
        "Too many questions were sent. Please wait a minute and try again."
      );
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      503,
      "RATE_LIMIT_UNAVAILABLE",
      "The AI assistant is temporarily unavailable."
    );
  }
}

function usageLimitError(reason, sessionLimit) {
  if (reason === "session") {
    return new HttpError(
      429,
      "SESSION_LIMIT",
      `You’ve reached the ${sessionLimit}-question limit for this browser session.`
    );
  }

  return new HttpError(
    429,
    "DAILY_LIMIT",
    "The AI assistant has reached its daily usage limit. Please try again tomorrow."
  );
}

export async function handleRequest(request, env) {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const requestOrigin = request.headers.get("origin");
  let origin = requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : null;

  try {
    if (url.pathname === HEALTH_PATH && request.method === "GET") {
      return jsonResponse(
        {
          status: "ok",
          aiEnabled: env.AI_ENABLED === "true",
          voiceEnabled: env.VOICE_ENABLED === "true",
          voiceConfigured: isVoiceConfigured(env)
        },
        { headers: { "X-Request-ID": requestId } }
      );
    }

    if (url.pathname !== CHAT_PATH) {
      throw new HttpError(404, "NOT_FOUND", "Not found.");
    }

    origin = requireAllowedOrigin(request, allowedOrigins);

    if (request.method === "OPTIONS") {
      validatePreflight(request);
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          "Cache-Control": "no-store",
          "X-Request-ID": requestId
        }
      });
    }

    if (request.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
    }

    if (env.AI_ENABLED !== "true") {
      throw new HttpError(
        503,
        "AI_DISABLED",
        "The AI assistant is currently turned off."
      );
    }

    const { question, sessionId, speak } = await readChatRequest(request);
    const { sessionKey, networkKey } = await deriveAbuseKeys(
      request,
      sessionId,
      env.RATE_LIMIT_SALT
    );
    await enforceBurstLimits(env, sessionKey, networkKey);

    const grounding = retrieveKnowledge(question, portfolio);
    const needsAiCall = !grounding.directAnswer;
    const voiceConfigured = speak && isVoiceConfigured(env);
    const sessionLimit = readIntegerSetting(env.SESSION_REQUEST_LIMIT, 5, {
      maximum: 20
    });
    const usage = await consumeUsage(env.USAGE_GUARD, {
      day: new Date().toISOString().slice(0, 10),
      sessionKey,
      countAiCall: needsAiCall,
      countVoiceCall: voiceConfigured,
      sessionLimit,
      dailyRequestLimit: readIntegerSetting(env.DAILY_REQUEST_LIMIT, 250, {
        maximum: 10_000
      }),
      dailyAiLimit: readIntegerSetting(env.DAILY_AI_LIMIT, 50, {
        maximum: 10_000
      }),
      dailyVoiceLimit: readIntegerSetting(env.DAILY_VOICE_LIMIT, 20, {
        maximum: 10_000
      })
    });

    if (!usage.allowed) throw usageLimitError(usage.reason, sessionLimit);

    const answer = grounding.directAnswer
      ? grounding.directAnswer
      : await generateGroundedAnswer({
          ai: env.AI,
          question,
          context: grounding.context,
          allowedLinks: grounding.allowedLinks,
          model: env.AI_MODEL,
          timeoutMs: readIntegerSetting(env.REQUEST_TIMEOUT_MS, 15_000, {
            minimum: 1_000,
            maximum: 25_000
          })
        });

    let speech = null;
    if (voiceConfigured && usage.voiceAllowed !== false) {
      try {
        speech = await synthesizeSpeech({
          text: answer.text,
          endpoint: env.VOICE_ENDPOINT_URL,
          proxyKey: env.MODAL_PROXY_KEY,
          proxySecret: env.MODAL_PROXY_SECRET,
          timeoutMs: readIntegerSetting(env.VOICE_TIMEOUT_MS, 120_000, {
            minimum: 5_000,
            maximum: 180_000
          }),
          fetchImpl: env.VOICE_FETCH
        });
      } catch {
        // Voice is an optional enhancement. The validated text answer remains usable.
      }
    }

    const payload = {
      ...answer,
      ...(speech ? { speech } : {}),
      ...(speak && !speech ? { speechUnavailable: true } : {})
    };

    return jsonResponse(payload, {
      headers: { ...corsHeaders(origin), "X-Request-ID": requestId }
    });
  } catch (error) {
    const extraHeaders = {};
    if (error instanceof HttpError && error.status === 405) extraHeaders.Allow = "POST, OPTIONS";
    if (error instanceof HttpError && error.status === 429) extraHeaders["Retry-After"] = "60";
    return errorResponse(error, requestId, origin, extraHeaders);
  }
}

export { UsageGuard };

export default {
  fetch: handleRequest
};
