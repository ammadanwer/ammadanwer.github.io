# Cloudflare Worker for Ammad’s portfolio AI

This directory contains the server-side boundary for `POST /api/chat`. It is intentionally separate from the static GitHub Pages frontend and is disabled by default. Phase 4 adds an optional authenticated call from this Worker to the private Modal voice service; the browser still cannot call Modal directly.

The Worker uses Cloudflare Workers AI, two burst rate-limiting bindings, and a SQLite-backed Durable Object. The Durable Object enforces the exact five-question browser-session limit, a 250-request daily abuse ceiling, and a 50-model-call daily budget ceiling. The built-in rate limiter is used only for fast per-session and coarse per-network burst protection because its counters are local and eventually consistent.

## Request and response

The endpoint accepts only this JSON shape:

```json
{
  "question": "What kind of AI work has Ammad done?",
  "sessionId": "a-random-browser-session-id",
  "speak": true
}
```

`question` is trimmed and limited to 500 characters. `sessionId` must contain 16–128 URL-safe characters. `speak` is optional and must be a boolean. Unknown fields, oversized bodies, non-JSON content, missing origins, and origins outside `ALLOWED_ORIGINS` are rejected before an AI call.

A successful response has this shape:

```json
{
  "text": "A concise answer grounded in approved portfolio data.",
  "links": [],
  "emotion": "neutral",
  "grounded": true,
  "sourceId": "workers-ai",
  "speech": {
    "mimeType": "audio/wav",
    "audioBase64": "...",
    "durationMs": 4200
  }
}
```

`speech` is returned only when it was requested, voice is fully configured,
the daily voice budget allows it, and Modal returns a bounded WAV response. If
voice fails, the response remains HTTP 200 with the validated text answer and
`speechUnavailable: true`.

Unknown and safety-sensitive questions use a deterministic approved response without calling the model. Model answers use lightweight retrieval from `../data/portfolio.json`; they are constrained by JSON schema and revalidated after generation. Model-provided links are discarded unless the exact URL was approved for that retrieved response.

## Local setup

Use Node.js 22 or newer, then install the Worker tooling without installing anything into the static site:

```sh
cd worker
npm install
cp .dev.vars.example .dev.vars
```

Replace `RATE_LIMIT_SALT` with at least 32 random characters. The voice values in the example can remain placeholders while `VOICE_ENABLED` is `false`. `.dev.vars` is ignored by Git. Do not add provider tokens to `wrangler.jsonc` or frontend files; the Workers AI binding does not require a browser-visible API token.

Run the Worker with:

```sh
npm run dev
```

The checked-in production configuration enables AI and voice. For local work that should not call providers, override those switches to `false` before starting Wrangler.

The dependency-free unit and handler tests run from the repository root:

```sh
npm test
```

After installing Worker dependencies, validate Cloudflare’s bundle without deploying:

```sh
npm run check
```

## Configuration and controls

Public operational settings are in `wrangler.jsonc`:

- `AI_ENABLED`: hard kill switch; only the exact string `true` enables calls.
- `AI_MODEL`: currently `@cf/meta/llama-3.1-8b-instruct-fast`, which supports Workers AI JSON mode.
- `ALLOWED_ORIGINS`: exact comma-separated origins; wildcard matching is not used.
- `SESSION_REQUEST_LIMIT`: exact daily count for a browser-session identifier.
- `DAILY_REQUEST_LIMIT`: global daily request guard, including deterministic answers.
- `DAILY_AI_LIMIT`: global daily model-call budget guard.
- `DAILY_VOICE_LIMIT`: global daily voice-attempt budget; exhaustion degrades to text rather than blocking chat.
- `REQUEST_TIMEOUT_MS`: model timeout, clamped to 1–25 seconds.
- `VOICE_ENABLED`: independent voice kill switch; all Modal settings must also be present.
- `VOICE_TIMEOUT_MS`: Modal synthesis timeout, clamped to 5–180 seconds.

`RATE_LIMIT_SALT` is a required Cloudflare secret. `VOICE_ENDPOINT_URL`, `MODAL_PROXY_KEY`, and `MODAL_PROXY_SECRET` are additional encrypted secrets required only when voice is enabled. The rate salt HMAC-hashes the browser session identifier and Cloudflare connecting IP before either is used as a rate or usage key. Questions and raw IP addresses are not logged or persisted by application code.

The rate-limit namespace IDs `1001` and `1002` must be changed if those IDs are already used in the target Cloudflare account. A shared namespace intentionally shares counters across Workers.

## Deployment runbook — do not run without authorization

No Cloudflare resource is provisioned by this repository alone. When deployment is explicitly authorized:

1. Authenticate Wrangler to the intended Cloudflare account.
2. Confirm the two rate-limit namespace IDs are unique in that account.
3. Configure the required `RATE_LIMIT_SALT` with Cloudflare’s encrypted secret facility.
4. Run `npm run check` and the root test suite.
5. Deploy with `AI_ENABLED` still set to `false` and verify `GET /health` reports `aiEnabled: false`.
6. Confirm production and local origins, the daily limits, Workers AI billing controls, and the generated Worker hostname.
7. Set `AI_ENABLED` to `true`, deploy the reviewed version, and test allowed and denied origins.
8. Only then set the frontend `mode` to `remote` and configure the Worker URL.

Voice remains a separate activation step:

1. Follow `../services/voice/README.md` to upload the ignored reference to the private Modal Volume and deploy the proxy-authenticated endpoint.
2. Create a Modal Proxy Token and add `VOICE_ENDPOINT_URL`, `MODAL_PROXY_KEY`, and `MODAL_PROXY_SECRET` with `wrangler secret put`.
3. Set a Modal workspace spending limit and confirm `min_containers=0`, `max_containers=1`, and the Worker daily voice limit.
4. Enable Worker `VOICE_ENABLED`, verify a Worker response contains audio, and verify the text fallback by temporarily disabling voice.
5. Only after that test should the frontend `voiceEnabled` setting become `true`.

To stop voice cost without disabling text, set `VOICE_ENABLED` back to `false`. To stop all model usage, set `AI_ENABLED` back to `false`. The static portfolio and local mock assistant remain operational.

## Privacy and limitations

CORS protects browser access from unapproved origins; it is not authentication. The primary identifier is the random browser-session ID. A separately hashed IP-derived key is only a coarse abuse fallback and may group users on shared networks. The exact Durable Object counters are the accounting boundary; Cloudflare’s rate-limiting binding is deliberately not used as the budget ledger.
