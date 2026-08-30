import { HttpError } from "./contracts.mjs";

export const MAX_VOICE_AUDIO_BYTES = 6_000_000;
export const DEFAULT_VOICE_TIMEOUT_MS = 120_000;

function voiceFailure(code = "VOICE_UNAVAILABLE") {
  return new HttpError(
    502,
    code,
    "The spoken version of this answer is temporarily unavailable."
  );
}

function validSecret(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function applyPronunciationOverrides(text) {
  return text
    .replace(/\bAmmad\b/g, "Ammaad")
    .replace(/\bMelbourne\b/g, "Melburn");
}

export function isVoiceConfigured(env) {
  return (
    env?.VOICE_ENABLED === "true" &&
    validSecret(env.VOICE_ENDPOINT_URL) &&
    validSecret(env.MODAL_PROXY_KEY) &&
    validSecret(env.MODAL_PROXY_SECRET)
  );
}

function validateEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw voiceFailure("VOICE_NOT_CONFIGURED");
  }

  const localHttp =
    url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw voiceFailure("VOICE_NOT_CONFIGURED");
  }

  return url.href;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return globalThis.btoa(binary);
}

function durationHeader(response) {
  const value = Number.parseInt(response.headers.get("x-audio-duration-ms") ?? "", 10);
  return Number.isInteger(value) && value > 0 && value <= 120_000 ? value : null;
}

export async function synthesizeSpeech(options) {
  const {
    text,
    endpoint,
    proxyKey,
    proxySecret,
    timeoutMs = DEFAULT_VOICE_TIMEOUT_MS,
    maxAudioBytes = MAX_VOICE_AUDIO_BYTES,
    fetchImpl = globalThis.fetch
  } = options;

  if (
    typeof text !== "string" ||
    !text.trim() ||
    text.length > 700 ||
    !validSecret(proxyKey) ||
    !validSecret(proxySecret) ||
    typeof fetchImpl !== "function"
  ) {
    throw voiceFailure("VOICE_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetchImpl(validateEndpoint(endpoint), {
      method: "POST",
      headers: {
        Accept: "audio/wav",
        "Content-Type": "application/json",
        "Modal-Key": proxyKey,
        "Modal-Secret": proxySecret
      },
      body: JSON.stringify({ text: applyPronunciationOverrides(text.trim()) }),
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.name === "AbortError") throw voiceFailure("VOICE_TIMEOUT");
    throw voiceFailure();
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw voiceFailure(response.status === 401 ? "VOICE_AUTH_FAILED" : undefined);
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!["audio/wav", "audio/x-wav"].includes(contentType)) {
    throw voiceFailure("INVALID_VOICE_RESPONSE");
  }

  const declaredLength = Number.parseInt(
    response.headers.get("content-length") ?? "0",
    10
  );
  if (Number.isFinite(declaredLength) && declaredLength > maxAudioBytes) {
    throw voiceFailure("VOICE_RESPONSE_TOO_LARGE");
  }

  const audio = await response.arrayBuffer();
  if (audio.byteLength < 44 || audio.byteLength > maxAudioBytes) {
    throw voiceFailure(
      audio.byteLength > maxAudioBytes
        ? "VOICE_RESPONSE_TOO_LARGE"
        : "INVALID_VOICE_RESPONSE"
    );
  }

  const durationMs = durationHeader(response);
  return {
    mimeType: "audio/wav",
    audioBase64: arrayBufferToBase64(audio),
    ...(durationMs ? { durationMs } : {})
  };
}
