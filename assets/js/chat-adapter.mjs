export const DEFAULT_MAX_QUESTION_LENGTH = 500;
export const DEFAULT_MAX_QUESTIONS = 5;
export const DEFAULT_REMOTE_TIMEOUT_MS = 15_000;
export const DEFAULT_REMOTE_VOICE_TIMEOUT_MS = 150_000;
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export class ChatAdapterError extends Error {
  constructor(message, code = "CHAT_ERROR") {
    super(message);
    this.name = "ChatAdapterError";
    this.code = code;
  }
}

export function validateQuestion(value, maxLength = DEFAULT_MAX_QUESTION_LENGTH) {
  if (typeof value !== "string") {
    throw new ChatAdapterError("Please enter a question.", "INVALID_QUESTION");
  }

  const question = value.trim().replace(/\s+/g, " ");
  if (!question) {
    throw new ChatAdapterError("Please enter a question.", "EMPTY_QUESTION");
  }
  if (question.length > maxLength) {
    throw new ChatAdapterError(
      `Please keep your question under ${maxLength} characters.`,
      "QUESTION_TOO_LONG"
    );
  }

  return question;
}

function normalize(value) {
  return value
    .toLocaleLowerCase("en")
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9#+.]+/g, " ")
    .trim();
}

function scoreKeyword(question, questionTokens, keyword) {
  const normalizedKeyword = normalize(keyword);
  if (!normalizedKeyword) return 0;

  if (normalizedKeyword.includes(" ")) {
    return question.includes(normalizedKeyword)
      ? normalizedKeyword.split(" ").length * 3
      : 0;
  }

  return questionTokens.has(normalizedKeyword) ? 2 : 0;
}

function findMentionedSkills(normalizedQuestion, skills) {
  const questionTokens = new Set(normalizedQuestion.split(" "));
  const mentioned = [];

  for (const skill of Object.values(skills ?? {}).flat()) {
    const normalizedSkill = normalize(skill);
    const isMentioned = normalizedSkill.includes(" ")
      ? normalizedQuestion.includes(normalizedSkill)
      : questionTokens.has(normalizedSkill);

    if (isMentioned) mentioned.push(skill);
  }

  return mentioned;
}

function skillResponse(skills) {
  const formatted =
    skills.length === 1
      ? skills[0]
      : `${skills.slice(0, -1).join(", ")} and ${skills.at(-1)}`;

  return {
    id: "verified-skills",
    text: `I have listed ${formatted} in my approved portfolio. I don’t have more verified detail about my proficiency level beyond the public experience shown here.`,
    links: []
  };
}

function selectResponse(question, knowledge) {
  const normalizedQuestion = normalize(question);
  const questionTokens = new Set(normalizedQuestion.split(" "));

  if (/\b(opinion|believe|favorite|favourite|prefer|endorse|recommend)\b|\bthink about\b/.test(normalizedQuestion)) {
    return null;
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const response of knowledge.responses) {
    const keywordScore = response.keywords.reduce(
      (total, keyword) => total + scoreKeyword(normalizedQuestion, questionTokens, keyword),
      0
    );
    const score = keywordScore > 0 ? keywordScore + (response.priority ?? 0) : 0;

    if (score > bestScore) {
      bestMatch = response;
      bestScore = score;
    }
  }

  const genericResponseIds = new Set(["career", "skills", "overview"]);
  if (bestMatch && !genericResponseIds.has(bestMatch.id)) return bestMatch;

  const mentionedSkills = findMentionedSkills(normalizedQuestion, knowledge.skills);
  if (mentionedSkills.length) return skillResponse(mentionedSkills);

  const asksAboutSpecificCapability =
    /\b(experience|worked|familiar) with\b|\bdoes\b.+\b(know|use)\b/.test(normalizedQuestion);
  if (asksAboutSpecificCapability) return null;

  return bestMatch;
}

function validateKnowledge(knowledge) {
  if (
    !knowledge ||
    knowledge.schemaVersion !== 1 ||
    !Array.isArray(knowledge.responses) ||
    !knowledge.fallback?.text
  ) {
    throw new ChatAdapterError(
      "The approved portfolio knowledge could not be loaded.",
      "INVALID_KNOWLEDGE"
    );
  }
}

function toAnswer(response) {
  return {
    text: response.text,
    links: Array.isArray(response.links) ? response.links : [],
    emotion: "neutral",
    grounded: true,
    sourceId: response.id ?? "fallback"
  };
}

export function createLocalChatAdapter(knowledge, options = {}) {
  validateKnowledge(knowledge);
  const maxLength = options.maxQuestionLength ?? DEFAULT_MAX_QUESTION_LENGTH;
  const delayMs = Math.max(0, options.delayMs ?? 450);

  return {
    async ask(value) {
      const question = validateQuestion(value, maxLength);
      const response = selectResponse(question, knowledge) ?? knowledge.fallback;

      if (delayMs) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
      }

      return toAnswer(response);
    }
  };
}

function validateRemoteAnswer(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ChatAdapterError(
      "The AI assistant returned an invalid response.",
      "INVALID_REMOTE_RESPONSE"
    );
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (
    !text ||
    text.length > 700 ||
    !/\b(?:i|i['’]m|i['’]ve|me|my)\b/i.test(text)
  ) {
    throw new ChatAdapterError(
      "The AI assistant returned an invalid response.",
      "INVALID_REMOTE_RESPONSE"
    );
  }

  const links = (Array.isArray(payload.links) ? payload.links : [])
    .filter(
      (link) =>
        typeof link?.label === "string" &&
        typeof link?.href === "string" &&
        /^(https?:|mailto:|tel:)/i.test(link.href)
    )
    .slice(0, 3)
    .map(({ label, href }) => ({ label, href }));

  const candidateSpeech = payload.speech;
  const validSpeech =
    candidateSpeech &&
    typeof candidateSpeech === "object" &&
    candidateSpeech.mimeType === "audio/wav" &&
    typeof candidateSpeech.audioBase64 === "string" &&
    candidateSpeech.audioBase64.length >= 60 &&
    candidateSpeech.audioBase64.length <= 8_000_000 &&
    candidateSpeech.audioBase64.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(candidateSpeech.audioBase64);

  const speech = validSpeech
    ? {
        mimeType: "audio/wav",
        audioBase64: candidateSpeech.audioBase64,
        ...(Number.isInteger(candidateSpeech.durationMs) &&
        candidateSpeech.durationMs > 0 &&
        candidateSpeech.durationMs <= 120_000
          ? { durationMs: candidateSpeech.durationMs }
          : {})
      }
    : null;

  return {
    text,
    links,
    emotion: ["neutral", "warm", "enthusiastic", "thoughtful"].includes(
      payload.emotion
    )
      ? payload.emotion
      : "neutral",
    grounded: payload.grounded === true,
    sourceId: payload.sourceId ?? "remote",
    ...(speech ? { speech } : {}),
    speechUnavailable: payload.speechUnavailable === true || Boolean(candidateSpeech && !speech)
  };
}

function remoteEndpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ChatAdapterError(
      "The remote AI endpoint is not configured.",
      "INVALID_REMOTE_ENDPOINT"
    );
  }

  const localHttp =
    url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new ChatAdapterError(
      "The remote AI endpoint must use HTTPS.",
      "INVALID_REMOTE_ENDPOINT"
    );
  }

  return url.href;
}

export function getOrCreateSessionId(storage, cryptoSource = globalThis.crypto) {
  const storageKey = "ammad-ai-session-id-v1";

  try {
    const existing = storage.getItem(storageKey);
    if (SESSION_ID_PATTERN.test(existing ?? "")) return existing;
  } catch {
    // Continue with an in-memory identifier when storage is unavailable.
  }

  if (!cryptoSource || typeof cryptoSource.getRandomValues !== "function") {
    throw new ChatAdapterError(
      "This browser cannot create a secure chat session.",
      "SESSION_UNAVAILABLE"
    );
  }

  const randomBytes = cryptoSource.getRandomValues(new Uint8Array(16));
  const sessionId = Array.from(randomBytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  try {
    storage.setItem(storageKey, sessionId);
  } catch {
    // The caller keeps this value for the life of the current page.
  }

  return sessionId;
}

export function createRemoteChatAdapter(endpoint, options = {}) {
  const url = remoteEndpoint(endpoint);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sessionId = options.sessionId;
  const maxLength = options.maxQuestionLength ?? DEFAULT_MAX_QUESTION_LENGTH;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS;
  const voiceTimeoutMs =
    options.voiceTimeoutMs ?? DEFAULT_REMOTE_VOICE_TIMEOUT_MS;
  const speechEnabled = options.speechEnabled ?? false;

  if (typeof fetchImpl !== "function") {
    throw new ChatAdapterError(
      "The remote AI assistant is unavailable in this browser.",
      "REMOTE_UNAVAILABLE"
    );
  }
  if (!SESSION_ID_PATTERN.test(sessionId ?? "")) {
    throw new ChatAdapterError(
      "The browser chat session could not be created.",
      "INVALID_SESSION"
    );
  }

  return {
    async ask(value) {
      const question = validateQuestion(value, maxLength);
      const speak =
        typeof speechEnabled === "function"
          ? speechEnabled() === true
          : speechEnabled === true;
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(
        () => controller.abort(),
        speak ? voiceTimeoutMs : timeoutMs
      );
      const requestBody = { question, sessionId };
      if (speak) requestBody.speak = true;

      try {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody),
          cache: "no-store",
          signal: controller.signal
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch {
          // The status-based error below remains safe when the body is malformed.
        }

        if (!response.ok) {
          const message =
            typeof payload?.error?.message === "string"
              ? payload.error.message
              : "The AI assistant is temporarily unavailable. Please try again.";
          throw new ChatAdapterError(
            message,
            payload?.error?.code ?? `REMOTE_HTTP_${response.status}`
          );
        }

        return validateRemoteAnswer(payload);
      } catch (error) {
        if (error instanceof ChatAdapterError) throw error;
        if (error?.name === "AbortError") {
          throw new ChatAdapterError(
            "The AI assistant took too long to respond. Please try again.",
            "REMOTE_TIMEOUT"
          );
        }
        throw new ChatAdapterError(
          "The AI assistant is temporarily unavailable. Please try again.",
          "REMOTE_UNAVAILABLE"
        );
      } finally {
        globalThis.clearTimeout(timeoutId);
      }
    }
  };
}

export class SessionQuestionLimit {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.key = options.key ?? "ammad-ai-question-count-v1";
    this.maximum = options.maximum ?? DEFAULT_MAX_QUESTIONS;
    this.inMemoryCount = 0;
  }

  count() {
    try {
      const parsed = Number.parseInt(this.storage.getItem(this.key) ?? "0", 10);
      const storedCount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      return Math.min(Math.max(storedCount, this.inMemoryCount), this.maximum);
    } catch {
      return Math.min(this.inMemoryCount, this.maximum);
    }
  }

  remaining() {
    return Math.max(0, this.maximum - this.count());
  }

  consume() {
    const current = this.count();
    if (current >= this.maximum) {
      throw new ChatAdapterError(
        `You’ve reached the ${this.maximum}-question limit for this browser session.`,
        "SESSION_LIMIT"
      );
    }

    this.inMemoryCount = current + 1;
    try {
      this.storage.setItem(this.key, String(this.inMemoryCount));
    } catch {
      // A storage-disabled browser still gets the in-memory page experience.
    }

    return Math.max(0, this.maximum - current - 1);
  }
}
