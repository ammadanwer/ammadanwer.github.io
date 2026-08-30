# Muhammad Ammad’s portfolio

This repository is the static GitHub Pages portfolio at <https://ammadanwer.github.io/>.

## AI portfolio assistant

The accessible **Ask my AI** widget is explicitly labelled as an AI representation. The production frontend calls a Cloudflare Worker that answers from approved content in `data/portfolio.json`; provider and voice credentials never enter the browser.

The deployed Worker under `worker/` provides exact-origin CORS, strict request validation, HMAC-hashed abuse keys, per-session and per-network burst limits, an exact Durable Object usage ledger, lightweight portfolio retrieval, structured Workers AI output, safe error mapping, and hard AI and voice kill switches. See `worker/README.md` for the contract and deployment runbook.

The current implementation includes:

- suggested questions and concise, portfolio-grounded answers;
- an explicit fallback for information that is not in the approved data;
- safe public links where relevant;
- loading, typing, error, retry, minimize, keyboard, and focus behavior;
- a 500-character question limit and five-question browser-session limit;
- no persistent conversation history (only the question count is kept in `sessionStorage`);
- reduced-motion styling and a fully usable text-only fallback.

Answers use a first-person portfolio voice (`I`/`my`) for a more natural avatar conversation. The persistent disclosure identifies the speaker as an AI representation rather than the real Ammad. Safety and availability responses continue to direct visitors to the real Ammad and cannot negotiate, promise, or make decisions on his behalf.

Phase 3 adds a dependency-free, browser-rendered 2D avatar directly to the widget. It has idle, listening, thinking, speaking, and error states; natural blinking and breathing; emotion accents; and an accessible status label. The existing answer message is always the authoritative text transcript. Reduced-motion users receive the same state and caption information without continuous animation.

The deployed voice phase adds:

- a private `services/voice/` Modal service using Chatterbox Turbo on a scale-to-zero L4;
- a sentence-aligned 9.58-second reference WAV stored only in the ignored `services/voice/private/` directory;
- Modal Proxy Token authentication and a private Volume boundary for the recording;
- an optional Worker `speak` contract, a separate daily voice budget, bounded WAV validation, and graceful text-only fallback;
- browser Web Audio playback, an explicit voice toggle, reduced-motion support, and amplitude-driven avatar mouth movement; and
- a disclosure that enabled speech is a synthetic clone rather than the real Ammad.

The production frontend, Worker AI, and Worker voice switches are enabled. The browser never receives Modal credentials, the voice sample is never returned to the browser, and identical text answers remain usable if synthesis or autoplay fails. Change the corresponding switch back to `false` to stop voice or AI independently.

Microphone input remains intentionally deferred.

## Run locally

The page uses JavaScript modules and fetches its knowledge JSON, so serve it over HTTP rather than opening `index.html` directly:

```sh
npm run serve
```

Then open <http://localhost:8000/>.

Run the dependency-free unit and content-alignment tests with:

```sh
npm test
```

This runs the JavaScript/browser/Worker suite and the dependency-free Python
voice-contract tests. It does not download Chatterbox weights or start a paid
GPU.

## Configuration and kill switch

Public, non-secret frontend settings live in `assets/js/ai-chat-config.js`. To disable the feature without affecting the portfolio, change:

```js
enabled: false
```

The avatar can be disabled independently while preserving text chat:

```js
avatarEnabled: false
```

The synthetic voice control is also disabled independently:

```js
voiceEnabled: false
```

Do not put API tokens or provider credentials in this file or anywhere in the GitHub Pages frontend.

The production frontend uses the `remote` adapter with the exact Worker chat route:

```js
mode: "remote",
endpoint: "https://ammad-portfolio-ai.ammad-anwer.workers.dev/api/chat"
```

Use `mode: "mock"` only for deterministic local development that should not call the deployed Worker.

The deployed cloned voice uses a private Modal Volume, Modal Proxy Token, and
encrypted Worker secrets. The complete voice runbook is in
`services/voice/README.md`.

## Updating approved information

`data/portfolio.json` is the only approved knowledge source for the chat. When a visible role, credential, skill, contact link, or summary changes, update the structured data and curated responses in the same change. The test suite checks that role titles, companies, and dates remain aligned with `index.html`.

The current corpus was reconciled from the latest base resume and all job-tailored resume variants. Semantically duplicate bullets are consolidated, job-targeted title wording is not treated as career history, and the canonical current title is **Staff AI Engineer**.

The mock responder in `assets/js/chat-adapter.mjs` remains available for local testing and performs lightweight keyword retrieval over the curated responses. Unknown topics always return the verified-information fallback; it does not synthesize or infer missing facts.

## Server-side security boundary

GitHub Pages remains a static frontend. The Worker is the only supported remote AI boundary and enforces validation, allowed origins, server-side network/session limits, timeouts, provider error mapping, and global request/model budgets. The five-question frontend limit is a product control; the Worker independently enforces the same session ceiling.

The voice endpoint is authenticated with a Modal Proxy Token and called only by
the Worker. The Worker enforces a separate daily voice-attempt budget and never
passes Modal credentials to GitHub Pages. Private recordings, embeddings,
model caches, provider state, and generated private audio belong outside Git;
`.gitignore` includes defensive coverage for those paths.
