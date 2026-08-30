import { HttpError } from "./contracts.mjs";

const encoder = new TextEncoder();

export async function keyedDigest(value, secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new HttpError(
      503,
      "SERVICE_NOT_CONFIGURED",
      "The AI assistant is temporarily unavailable."
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function deriveAbuseKeys(request, sessionId, secret) {
  const connectingIp = request.headers.get("cf-connecting-ip") ?? "local-development";
  const [sessionKey, networkKey] = await Promise.all([
    keyedDigest(`session:${sessionId}`, secret),
    keyedDigest(`network:${connectingIp}`, secret)
  ]);

  return { sessionKey, networkKey };
}
