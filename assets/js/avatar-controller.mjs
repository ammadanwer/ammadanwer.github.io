export const AVATAR_STATES = Object.freeze([
  "idle",
  "listening",
  "thinking",
  "speaking",
  "error"
]);

const EMOTIONS = new Set(["neutral", "warm", "enthusiastic", "thoughtful"]);
const STATE_LABELS = Object.freeze({
  idle: "Ready",
  listening: "Listening",
  thinking: "Checking approved facts",
  speaking: "Sharing an answer",
  error: "Needs a moment"
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export class AvatarController {
  constructor(root, options = {}) {
    if (!root) throw new TypeError("Avatar root element is required.");

    this.root = root;
    this.status = options.statusElement ?? root.querySelector("[data-avatar-status]");
    this.caption = options.captionElement ?? root.querySelector("[data-avatar-caption]");
    this.schedule = options.schedule ?? globalThis.setTimeout.bind(globalThis);
    this.cancel = options.cancel ?? globalThis.clearTimeout.bind(globalThis);
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    this.timer = null;
    this.root.dataset.reducedMotion = String(this.reducedMotion);
    this.setState("idle");
  }

  setState(state, options = {}) {
    if (!AVATAR_STATES.includes(state)) {
      throw new TypeError(`Unsupported avatar state: ${state}`);
    }

    this.clearTimer();
    this.root.dataset.state = state;
    this.root.dataset.emotion = EMOTIONS.has(options.emotion)
      ? options.emotion
      : "neutral";

    if (this.status) {
      this.status.textContent =
        options.status ??
        (state === "speaking" && this.reducedMotion
          ? "Answer ready"
          : STATE_LABELS[state]);
    }
    if (this.caption && typeof options.caption === "string") {
      this.caption.textContent = options.caption;
    }

    return state;
  }

  setIdle() {
    this.root.dataset.audioDriven = "false";
    this.root.style?.removeProperty("--avatar-mouth-open");
    return this.setState("idle");
  }

  setListening() {
    return this.setState("listening");
  }

  setThinking(status) {
    return this.setState("thinking", { status });
  }

  setError() {
    this.setState("error");
    this.timer = this.schedule(() => this.setIdle(), 1_800);
  }

  presentAnswer(text, emotion = "neutral") {
    const caption = typeof text === "string" ? text.trim() : "";
    const wordCount = caption ? caption.split(/\s+/).length : 0;
    const duration = this.reducedMotion
      ? 1_200
      : clamp(wordCount * 105, 1_400, 4_800);

    this.root.dataset.audioDriven = "false";
    this.setState("speaking", { caption, emotion });
    this.timer = this.schedule(() => this.setIdle(), duration);
    return duration;
  }

  beginAudioDrivenSpeech(text, emotion = "neutral") {
    this.root.dataset.audioDriven = "true";
    this.setState("speaking", {
      caption: typeof text === "string" ? text.trim() : "",
      emotion
    });
  }

  setMouthLevel(level) {
    const normalizedLevel = clamp(Number(level) || 0, 0, 1);
    this.root.dataset.audioDriven = "true";
    this.root.style?.setProperty(
      "--avatar-mouth-open",
      String(0.15 + normalizedLevel * 0.85)
    );
  }

  finishAudioDrivenSpeech() {
    this.setIdle();
  }

  pause() {
    this.setIdle();
  }

  clearTimer() {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    this.clearTimer();
    this.root.style?.removeProperty("--avatar-mouth-open");
  }
}

export function createAvatarController(root, options = {}) {
  return root ? new AvatarController(root, options) : null;
}
