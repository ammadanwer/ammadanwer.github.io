# Private Chatterbox voice service

This directory defines the Phase 4 text-to-speech service. It uses Chatterbox
Turbo on a scale-to-zero Modal L4 container and exposes one proxy-authenticated
`POST` endpoint. The browser never receives Modal credentials and cannot call
this service directly; the Cloudflare Worker is the only supported caller.

The current implementation follows Resemble AI's Chatterbox Turbo API and
Modal's current Chatterbox, lifecycle, Volume, and proxy-authentication
guidance:

- <https://github.com/resemble-ai/chatterbox>
- <https://modal.com/docs/examples/chatterbox_tts>
- <https://modal.com/docs/guide/lifecycle-functions>
- <https://modal.com/docs/guide/webhook-proxy-auth>

## Private reference recording

The prepared local reference is:

```text
services/voice/private/ammad-reference.wav
```

It is a sentence-aligned 9.58-second mono PCM WAV. The raw M4A, full decoded
recording, deployment reference, generated audio, embeddings, and caches are
ignored by Git. Never force-add them.

Upload the reference to a private Volume only after Modal deployment is
explicitly authorized:

```sh
modal volume create ammad-avatar-voice
modal volume put --force ammad-avatar-voice \
  services/voice/private/ammad-reference.wav \
  /ammad-reference.wav
```

## Validate locally

The validation tests do not download a model or require Modal credentials:

```sh
python3 -B -m unittest discover -s services/voice/tests
PYTHONPYCACHEPREFIX=/tmp/ai-avatar-pycache \
  python3 -m py_compile services/voice/app.py services/voice/voice_contracts.py
```

## Serve or deploy on Modal

Install and authenticate the Modal CLI, then create a Modal Proxy Token in the
workspace dashboard. Serving creates a temporary public URL; deploying creates
a persistent one. Both remain inaccessible without the proxy token.

```sh
modal serve services/voice/app.py
modal deploy services/voice/app.py
```

The service has `min_containers=0`, `max_containers=1`, a 60-second scale-down
window, and a hard 180-second request timeout. The first request after scaling
to zero includes model startup time. Chatterbox prepares the private speaker
conditionals once per container and watermarks generated speech.

After receiving the Modal endpoint URL, configure these encrypted Worker
secrets rather than putting them in frontend code or `wrangler.jsonc`:

```text
VOICE_ENDPOINT_URL
MODAL_PROXY_KEY
MODAL_PROXY_SECRET
```

Keep the Worker's `VOICE_ENABLED` setting set to `false` until the private
Volume, proxy token, spending limit, and end-to-end test are complete.
