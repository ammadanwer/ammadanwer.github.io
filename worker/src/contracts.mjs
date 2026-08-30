export const MAX_QUESTION_LENGTH = 500;
export const MAX_REQUEST_BYTES = 2_048;
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export async function readChatRequest(request, options = {}) {
  const maxQuestionLength = options.maxQuestionLength ?? MAX_QUESTION_LENGTH;
  const maxRequestBytes = options.maxRequestBytes ?? MAX_REQUEST_BYTES;
  const contentType = request.headers.get("content-type") ?? "";

  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new HttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send the request as application/json."
    );
  }

  const declaredLength = Number.parseInt(
    request.headers.get("content-length") ?? "0",
    10
  );
  if (Number.isFinite(declaredLength) && declaredLength > maxRequestBytes) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "The request is too large.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxRequestBytes) {
    throw new HttpError(413, "REQUEST_TOO_LARGE", "The request is too large.");
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "The request body is not valid JSON.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "INVALID_REQUEST", "The request body must be an object.");
  }

  const keys = Object.keys(body);
  const allowedKeys = new Set(["question", "sessionId", "speak"]);
  if (
    keys.length < 2 ||
    keys.length > allowedKeys.size ||
    !keys.includes("question") ||
    !keys.includes("sessionId") ||
    keys.some((key) => !allowedKeys.has(key))
  ) {
    throw new HttpError(
      400,
      "INVALID_REQUEST",
      "The request must contain question, sessionId, and optionally speak."
    );
  }

  if (typeof body.question !== "string") {
    throw new HttpError(400, "INVALID_QUESTION", "Please enter a question.");
  }

  const question = body.question.trim().replace(/\s+/g, " ");
  if (!question) {
    throw new HttpError(400, "EMPTY_QUESTION", "Please enter a question.");
  }
  if (question.length > maxQuestionLength) {
    throw new HttpError(
      400,
      "QUESTION_TOO_LONG",
      `Please keep your question under ${maxQuestionLength} characters.`
    );
  }

  if (
    typeof body.sessionId !== "string" ||
    !SESSION_ID_PATTERN.test(body.sessionId)
  ) {
    throw new HttpError(
      400,
      "INVALID_SESSION",
      "The browser session identifier is invalid."
    );
  }

  if (body.speak !== undefined && typeof body.speak !== "boolean") {
    throw new HttpError(
      400,
      "INVALID_SPEECH_SETTING",
      "The optional speak setting must be a boolean."
    );
  }

  return { question, sessionId: body.sessionId, speak: body.speak === true };
}

export function parseAllowedOrigins(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

export function requireAllowedOrigin(request, allowedOrigins) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed.");
  }
  return origin;
}

export function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

export function jsonResponse(payload, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");

  return new Response(JSON.stringify(payload), {
    status: options.status ?? 200,
    headers
  });
}

export function readIntegerSetting(value, fallback, bounds = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  const minimum = bounds.minimum ?? 1;
  const maximum = bounds.maximum ?? Number.MAX_SAFE_INTEGER;

  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}
