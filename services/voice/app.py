"""Scale-to-zero Chatterbox Turbo voice endpoint for Modal.

The reference recording is mounted from a private Modal Volume. It is never
included in this source file, the container image, or the public repository.
"""

from pathlib import Path
import time

import modal


APP_NAME = "ammad-avatar-voice"
VOICE_VOLUME_NAME = "ammad-avatar-voice"
MODEL_CACHE_VOLUME_NAME = "ammad-avatar-model-cache"
VOICE_MOUNT_PATH = "/voice"
MODEL_CACHE_PATH = "/root/.cache/huggingface"
REFERENCE_PATH = Path(VOICE_MOUNT_PATH) / "ammad-reference.wav"

voice_volume = modal.Volume.from_name(VOICE_VOLUME_NAME, create_if_missing=True)
model_cache_volume = modal.Volume.from_name(
    MODEL_CACHE_VOLUME_NAME,
    create_if_missing=True,
)

image = (
    modal.Image.debian_slim(python_version="3.10")
    .uv_pip_install(
        "chatterbox-tts==0.1.7",
        "fastapi[standard]==0.124.4",
        "peft==0.18.0",
    )
    .env(
        {
            "HF_HOME": MODEL_CACHE_PATH,
            "HF_XET_HIGH_PERFORMANCE": "1",
        }
    )
    .add_local_file(
        str(Path(__file__).with_name("voice_contracts.py")),
        "/root/voice_contracts.py",
    )
)

app = modal.App(APP_NAME, image=image)

with image.imports():
    import io

    import torch
    import torchaudio as ta
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    from fastapi import HTTPException
    from fastapi.responses import Response
    from voice_contracts import VoiceTextError, validate_speech_text


@app.cls(
    gpu="L4",
    min_containers=0,
    max_containers=1,
    scaledown_window=60,
    startup_timeout=300,
    timeout=180,
    volumes={
        VOICE_MOUNT_PATH: voice_volume,
        MODEL_CACHE_PATH: model_cache_volume,
    },
)
@modal.concurrent(max_inputs=1)
class ChatterboxVoice:
    @modal.enter()
    def load(self):
        if not REFERENCE_PATH.is_file():
            raise RuntimeError(
                "The private voice reference is missing from the Modal Volume."
            )

        self.model = ChatterboxTurboTTS.from_pretrained(device="cuda")
        with torch.inference_mode():
            self.model.prepare_conditionals(str(REFERENCE_PATH))

    @modal.fastapi_endpoint(
        method="POST",
        requires_proxy_auth=True,
    )
    def synthesize(self, request: dict):
        try:
            text = validate_speech_text(request.get("text"))
        except VoiceTextError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

        started_at = time.monotonic()
        with torch.inference_mode():
            waveform = self.model.generate(text)

        output = io.BytesIO()
        ta.save(output, waveform, self.model.sr, format="wav")
        audio = output.getvalue()
        duration_ms = round(waveform.shape[-1] / self.model.sr * 1_000)
        synthesis_ms = round((time.monotonic() - started_at) * 1_000)

        return Response(
            content=audio,
            media_type="audio/wav",
            headers={
                "Cache-Control": "private, no-store",
                "X-Audio-Duration-Ms": str(duration_ms),
                "X-Synthesis-Time-Ms": str(synthesis_ms),
            },
        )
