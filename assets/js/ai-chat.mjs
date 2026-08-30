import {
  ChatAdapterError,
  SessionQuestionLimit,
  createLocalChatAdapter,
  createRemoteChatAdapter,
  getOrCreateSessionId,
  validateQuestion
} from "./chat-adapter.mjs";
import { createAvatarController } from "./avatar-controller.mjs";
import { createAvatarAudioPlayer } from "./audio-player.mjs";

const defaults = {
  enabled: true,
  avatarEnabled: true,
  voiceEnabled: false,
  mode: "mock",
  endpoint: "",
  maxQuestionLength: 500,
  maxQuestionsPerSession: 5,
  mockDelayMs: 550,
  remoteTimeoutMs: 15000,
  remoteVoiceTimeoutMs: 150000
};

const config = { ...defaults, ...(window.AMMAD_AI_CONFIG ?? {}) };
const root = document.getElementById("ai-chat");

if (root && config.enabled) {
  startChat();
}

function startChat() {
  const launcher = document.getElementById("ai-chat-launcher");
  const panel = document.getElementById("ai-chat-panel");
  const closeButton = document.getElementById("ai-chat-close");
  const voiceToggle = document.getElementById("ai-chat-voice-toggle");
  const messages = document.getElementById("ai-chat-messages");
  const suggestions = document.getElementById("ai-chat-suggestions");
  const form = document.getElementById("ai-chat-form");
  const input = document.getElementById("ai-chat-input");
  const submitButton = document.getElementById("ai-chat-submit");
  const characterCount = document.getElementById("ai-chat-character-count");
  const questionLimit = document.getElementById("ai-chat-question-limit");
  const formError = document.getElementById("ai-chat-form-error");
  const statusElement = document.getElementById("ai-chat-status");
  const avatarRoot = document.getElementById("ai-avatar");
  const avatar = config.avatarEnabled
    ? createAvatarController(avatarRoot)
    : null;
  const audioPlayer = config.voiceEnabled
    ? createAvatarAudioPlayer(avatar)
    : null;

  const limiter = new SessionQuestionLimit(window.sessionStorage, {
    maximum: config.maxQuestionsPerSession
  });

  let adapter = null;
  let knowledgePromise = null;
  let busy = false;
  let voiceOn = Boolean(config.voiceEnabled);

  root.hidden = false;
  if (avatarRoot) avatarRoot.hidden = !config.avatarEnabled;
  if (voiceToggle) voiceToggle.hidden = !config.voiceEnabled;
  updateVoiceToggle();
  input.maxLength = config.maxQuestionLength;
  updateCharacterCount();
  updateLimit();

  launcher.addEventListener("click", openChat);
  closeButton.addEventListener("click", closeChat);
  voiceToggle?.addEventListener("click", async () => {
    voiceOn = !voiceOn;
    if (voiceOn && !(await audioPlayer?.unlock())) voiceOn = false;
    if (!voiceOn) audioPlayer?.stop();
    updateVoiceToggle();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuestion(input.value);
  });

  input.addEventListener("input", () => {
    updateCharacterCount();
    clearFormError();
    resizeInput();
    if (!busy && adapter) {
      input.value.trim() ? avatar?.setListening() : avatar?.setIdle();
    }
  });

  input.addEventListener("focus", () => {
    if (!busy && adapter && input.value.trim()) avatar?.setListening();
  });

  input.addEventListener("blur", () => {
    if (!busy && avatarRoot?.dataset.state === "listening") avatar?.setIdle();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeChat();
  });

  async function openChat() {
    panel.hidden = false;
    launcher.hidden = true;
    launcher.setAttribute("aria-expanded", "true");
    avatar?.setIdle();
    window.requestAnimationFrame(() => input.focus());

    if (!adapter && !knowledgePromise) {
      await initializeAdapter();
    }
  }

  function closeChat() {
    panel.hidden = true;
    launcher.hidden = false;
    launcher.setAttribute("aria-expanded", "false");
    avatar?.pause();
    audioPlayer?.stop();
    launcher.focus();
  }

  async function initializeAdapter() {
    setBusy(true, "Loading approved portfolio facts…");
    avatar?.setThinking("Loading approved facts");
    knowledgePromise = loadKnowledge();

    try {
      const knowledge = await knowledgePromise;
      if (config.mode === "mock") {
        adapter = createLocalChatAdapter(knowledge, {
          delayMs: config.mockDelayMs,
          maxQuestionLength: config.maxQuestionLength
        });
      } else if (config.mode === "remote") {
        adapter = createRemoteChatAdapter(config.endpoint, {
          sessionId: getOrCreateSessionId(window.sessionStorage),
          maxQuestionLength: config.maxQuestionLength,
          timeoutMs: config.remoteTimeoutMs,
          voiceTimeoutMs: config.remoteVoiceTimeoutMs,
          speechEnabled: () => voiceOn
        });
      } else {
        throw new ChatAdapterError(
          "The configured AI response mode is not supported.",
          "UNSUPPORTED_MODE"
        );
      }
      renderSuggestions(knowledge.suggestedQuestions ?? []);
      avatar?.setIdle();
    } catch (error) {
      knowledgePromise = null;
      const message = addMessage(
        "error",
        friendlyError(error, "I couldn’t load the approved portfolio facts.")
      );
      addRetryButton(message, "Try loading again", async () => {
        message.remove();
        await initializeAdapter();
      });
      avatar?.setError();
    } finally {
      setBusy(false);
    }
  }

  async function loadKnowledge() {
    const knowledgeUrl = new URL("../../data/portfolio.json", import.meta.url);
    const response = await window.fetch(knowledgeUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new ChatAdapterError(
        `Portfolio data returned HTTP ${response.status}.`,
        "KNOWLEDGE_REQUEST_FAILED"
      );
    }

    return response.json();
  }

  async function submitQuestion(value, options = {}) {
    if (voiceOn) void audioPlayer?.unlock();
    const consumeLimit = options.consumeLimit ?? true;
    const showUserMessage = options.showUserMessage ?? true;
    clearFormError();

    let question;
    try {
      question = validateQuestion(value, config.maxQuestionLength);
      if (!adapter) {
        throw new ChatAdapterError(
          "The portfolio facts are not ready yet. Please try again.",
          "ADAPTER_NOT_READY"
        );
      }
      if (consumeLimit) limiter.consume();
    } catch (error) {
      showFormError(friendlyError(error, "Please check your question and try again."));
      updateLimit();
      return;
    }

    if (showUserMessage) {
      addMessage("user", question);
      input.value = "";
      resizeInput();
      updateCharacterCount();
      suggestions.hidden = true;
    }

    updateLimit();
    setBusy(true, "AI is checking approved portfolio facts…");
    avatar?.setThinking();
    const typingMessage = addTypingMessage();

    try {
      const answer = await adapter.ask(question);
      typingMessage.remove();
      const answerMessage = addMessage("assistant", answer.text, answer.links);
      let audioStarted = false;

      if (voiceOn && answer.speech && !panel.hidden) {
        try {
          audioStarted =
            (await audioPlayer?.play(answer.speech, {
              caption: answer.text,
              emotion: answer.emotion
            })) === true;
        } catch {
          audioStarted = false;
        }
      }

      if (!audioStarted) {
        avatar?.presentAnswer(answer.text, answer.emotion);
        if (voiceOn && (answer.speechUnavailable || answer.speech)) {
          addMessageNote(answerMessage, "Voice unavailable; transcript shown.");
        }
      }
    } catch (error) {
      typingMessage.remove();
      const errorMessage = addMessage(
        "error",
        friendlyError(error, "I couldn’t answer that just now.")
      );
      addRetryButton(errorMessage, "Retry", () => {
        errorMessage.remove();
        submitQuestion(question, { consumeLimit: false, showUserMessage: false });
      });
      avatar?.setError();
    } finally {
      setBusy(false);
      updateLimit();
    }
  }

  function renderSuggestions(items) {
    suggestions.replaceChildren();

    for (const question of items.slice(0, 4)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-chat-suggestion";
      button.textContent = question;
      button.addEventListener("click", () => submitQuestion(question));
      suggestions.append(button);
    }

    suggestions.hidden = items.length === 0;
    updateLimit();
  }

  function addMessage(kind, text, links = []) {
    const message = document.createElement("article");
    message.className = `ai-chat-message ai-chat-message--${kind}`;

    const label = document.createElement("span");
    label.className = "ai-chat-message-label";
    label.textContent = kind === "user" ? "You" : "Ammad’s AI";

    const content = document.createElement("p");
    content.textContent = text;

    message.append(label, content);

    const safeLinks = links.filter((link) => isSafeLink(link?.href));
    if (safeLinks.length) {
      const linkList = document.createElement("div");
      linkList.className = "ai-chat-message-links";

      for (const link of safeLinks) {
        const anchor = document.createElement("a");
        anchor.href = link.href;
        anchor.textContent = link.label;
        if (/^https?:/i.test(link.href)) {
          anchor.target = "_blank";
          anchor.rel = "noopener";
        }
        linkList.append(anchor);
      }

      message.append(linkList);
    }

    messages.append(message);
    scrollMessages();
    return message;
  }

  function addTypingMessage() {
    const message = document.createElement("article");
    message.className = "ai-chat-message ai-chat-message--assistant ai-chat-typing";
    message.setAttribute("aria-label", "Ammad’s AI is checking approved portfolio facts");
    message.innerHTML = `
      <span class="ai-chat-message-label">Ammad’s AI</span>
      <span class="ai-chat-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
    `;
    messages.append(message);
    scrollMessages();
    return message;
  }

  function addRetryButton(message, label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-chat-retry";
    button.textContent = label;
    button.addEventListener("click", callback, { once: true });
    message.append(button);
  }

  function addMessageNote(message, text) {
    const note = document.createElement("span");
    note.className = "ai-chat-message-note";
    note.textContent = text;
    message.append(note);
  }

  function updateVoiceToggle() {
    if (!voiceToggle) return;
    voiceToggle.dataset.enabled = String(voiceOn);
    voiceToggle.setAttribute("aria-pressed", String(voiceOn));
    voiceToggle.setAttribute(
      "aria-label",
      voiceOn ? "Turn synthetic avatar voice off" : "Turn synthetic avatar voice on"
    );
    voiceToggle.title = voiceOn ? "Voice on" : "Voice off";
  }

  function setBusy(nextBusy, status = "") {
    busy = nextBusy;
    panel.setAttribute("aria-busy", String(busy));
    const atLimit = limiter.remaining() === 0;
    input.disabled = busy || atLimit || !adapter;
    submitButton.disabled = busy || atLimit || !adapter;
    suggestions.querySelectorAll("button").forEach((button) => {
      button.disabled = busy || atLimit || !adapter;
    });
    statusElement.textContent = status;
  }

  function updateLimit() {
    const remaining = limiter.remaining();
    const noun = remaining === 1 ? "question" : "questions";
    questionLimit.textContent = `${remaining} ${noun} left this session`;
    questionLimit.dataset.empty = String(remaining === 0);

    if (remaining === 0) {
      input.disabled = true;
      input.placeholder = "Session question limit reached";
      submitButton.disabled = true;
      suggestions.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
    }
  }

  function updateCharacterCount() {
    characterCount.textContent = `${input.value.length}/${config.maxQuestionLength}`;
  }

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 92)}px`;
  }

  function showFormError(message) {
    formError.textContent = message;
  }

  function clearFormError() {
    formError.textContent = "";
  }

  function scrollMessages() {
    messages.scrollTop = messages.scrollHeight;
  }
}

function friendlyError(error, fallback) {
  return error instanceof ChatAdapterError ? error.message : fallback;
}

function isSafeLink(href) {
  if (typeof href !== "string") return false;
  try {
    const url = new URL(href, window.location.href);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}
