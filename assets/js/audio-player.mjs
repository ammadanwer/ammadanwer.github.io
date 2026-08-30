const MAX_BASE64_AUDIO_LENGTH = 8_000_000;

export class AudioPlaybackError extends Error {
  constructor(message, code = "AUDIO_PLAYBACK_ERROR") {
    super(message);
    this.name = "AudioPlaybackError";
    this.code = code;
  }
}

export function decodeBase64Audio(value, decode = globalThis.atob) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_BASE64_AUDIO_LENGTH ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    typeof decode !== "function"
  ) {
    throw new AudioPlaybackError("The voice response is invalid.", "INVALID_AUDIO");
  }

  let binary;
  try {
    binary = decode(value);
  } catch {
    throw new AudioPlaybackError("The voice response is invalid.", "INVALID_AUDIO");
  }

  if (binary.length < 44) {
    throw new AudioPlaybackError("The voice response is invalid.", "INVALID_AUDIO");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function browserAudioContext() {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

export class AvatarAudioPlayer {
  constructor(avatar, options = {}) {
    this.avatar = avatar ?? null;
    this.createContext = options.createContext ?? browserAudioContext;
    this.requestFrame =
      options.requestFrame ?? globalThis.requestAnimationFrame?.bind(globalThis);
    this.cancelFrame =
      options.cancelFrame ?? globalThis.cancelAnimationFrame?.bind(globalThis);
    this.context = null;
    this.source = null;
    this.analyser = null;
    this.frame = null;
    this.playbackId = 0;
  }

  async unlock() {
    if (!this.context) this.context = this.createContext?.() ?? null;
    if (!this.context) return false;

    if (this.context.state === "suspended") {
      try {
        await this.context.resume();
      } catch {
        return false;
      }
    }

    return this.context.state !== "closed";
  }

  async play(speech, options = {}) {
    const ready = await this.unlock();
    if (!ready) {
      throw new AudioPlaybackError(
        "Audio playback is unavailable in this browser.",
        "AUDIO_UNAVAILABLE"
      );
    }

    if (speech?.mimeType !== "audio/wav") {
      throw new AudioPlaybackError("The voice response is invalid.", "INVALID_AUDIO");
    }

    const encodedAudio = decodeBase64Audio(speech.audioBase64);
    let decodedAudio;
    try {
      decodedAudio = await this.context.decodeAudioData(encodedAudio);
    } catch {
      throw new AudioPlaybackError("The voice response could not be decoded.", "DECODE_FAILED");
    }

    this.stop();
    const playbackId = ++this.playbackId;
    const source = this.context.createBufferSource();
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.68;
    source.buffer = decodedAudio;
    source.connect(analyser);
    analyser.connect(this.context.destination);
    this.source = source;
    this.analyser = analyser;

    source.onended = () => {
      if (this.playbackId !== playbackId) return;
      this.finishPlayback();
    };

    this.avatar?.beginAudioDrivenSpeech(options.caption, options.emotion);
    try {
      source.start(0);
    } catch {
      this.finishPlayback();
      throw new AudioPlaybackError("Audio playback could not start.", "PLAYBACK_FAILED");
    }

    if (!this.avatar?.reducedMotion) this.animateMouth(playbackId);
    return true;
  }

  animateMouth(playbackId) {
    if (!this.analyser || typeof this.requestFrame !== "function") return;
    const levels = new Uint8Array(this.analyser.fftSize);

    const update = () => {
      if (!this.analyser || this.playbackId !== playbackId) return;
      this.analyser.getByteTimeDomainData(levels);
      let energy = 0;
      for (const sample of levels) {
        const centered = (sample - 128) / 128;
        energy += centered * centered;
      }
      const rms = Math.sqrt(energy / levels.length);
      this.avatar?.setMouthLevel(Math.min(1, rms * 4.2));
      this.frame = this.requestFrame(update);
    };

    this.frame = this.requestFrame(update);
  }

  finishPlayback() {
    if (this.frame !== null && typeof this.cancelFrame === "function") {
      this.cancelFrame(this.frame);
    }
    this.frame = null;
    this.source?.disconnect?.();
    this.analyser?.disconnect?.();
    this.source = null;
    this.analyser = null;
    this.avatar?.finishAudioDrivenSpeech();
  }

  stop() {
    this.playbackId += 1;
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop(0);
      } catch {
        // A source that already ended does not need another stop.
      }
    }
    if (this.source || this.analyser || this.frame !== null) this.finishPlayback();
  }

  async destroy() {
    this.stop();
    if (this.context?.state !== "closed") await this.context?.close?.();
    this.context = null;
  }
}

export function createAvatarAudioPlayer(avatar, options = {}) {
  return new AvatarAudioPlayer(avatar, options);
}
