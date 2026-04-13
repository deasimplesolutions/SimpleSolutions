// ============================================
// CHATBOT WIDGET CONFIGURATION
// ============================================
// Edit the variables below to customize the widget.

// Your proxy server URL (deployed on Render)
const CHAT_PROXY_URL = "https://private-server-for-website.onrender.com";

// Business name shown in the chat header
const BUSINESS_NAME = "Simple Solutions";

// Initial greeting shown when the chat opens
const WELCOME_MESSAGE = "Hi there! How can I help you today?";

// ============================================
// WIDGET IMPLEMENTATION — no need to edit below
// ============================================

(function () {
  "use strict";

  let isOpen = false;
  let isLoading = false;
  let conversationHistory = []; // { role, content } pairs sent to the API

  // ── Build DOM ──

  function createWidget() {
    const container = document.createElement("div");
    container.id = "chat-widget-container";

    // Chat window
    container.innerHTML = `
      <div id="chat-widget-window">
        <div id="chat-widget-header">
          <div class="chat-avatar">${BUSINESS_NAME.charAt(0)}</div>
          <div class="chat-header-info">
            <div class="chat-business-name">${escapeHtml(BUSINESS_NAME)}</div>
            <div class="chat-status"><span class="chat-status-dot"></span> Online</div>
          </div>
        </div>
        <div id="chat-widget-messages">
          <div class="chat-welcome">Send a message to start the conversation.</div>
        </div>
        <div id="chat-widget-input-area">
          <textarea
            id="chat-widget-input"
            placeholder="Type a message…"
            rows="1"
          ></textarea>
          <button id="chat-widget-send-btn" aria-label="Send message">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div id="chat-widget-footer">Powered by Claude</div>
      </div>

      <button id="chat-widget-btn" aria-label="Open chat">
        <svg class="chat-icon-open" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h10v2H7zm0-3h10v2H7z"/></svg>
        <svg class="chat-icon-close" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    `;

    document.body.appendChild(container);

    // Bind events
    document
      .getElementById("chat-widget-btn")
      .addEventListener("click", toggleChat);
    document
      .getElementById("chat-widget-send-btn")
      .addEventListener("click", handleSend);
    document
      .getElementById("chat-widget-input")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });

    // Auto-resize textarea
    const input = document.getElementById("chat-widget-input");
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 100) + "px";
    });
  }

  // ── Toggle Open / Close ──

  function toggleChat() {
    isOpen = !isOpen;
    const win = document.getElementById("chat-widget-window");
    const btn = document.getElementById("chat-widget-btn");

    if (isOpen) {
      win.classList.add("open");
      btn.classList.add("open");
      // Add initial assistant greeting on first open
      if (conversationHistory.length === 0) {
        appendMessage("assistant", WELCOME_MESSAGE);
      }
      setTimeout(() => {
        document.getElementById("chat-widget-input").focus();
      }, 350);
    } else {
      win.classList.remove("open");
      btn.classList.remove("open");
    }
  }

  // ── Send Message ──

  async function handleSend() {
    if (isLoading) return;

    const input = document.getElementById("chat-widget-input");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    input.style.height = "auto";

    // Show user message
    appendMessage("user", text);

    // Add to history
    conversationHistory.push({ role: "user", content: text });

    // Show typing indicator
    isLoading = true;
    updateSendButton();
    showTypingIndicator();

    try {
      const reply = await callAnthropicAPI();
      removeTypingIndicator();
      appendMessage("assistant", reply);
      conversationHistory.push({ role: "assistant", content: reply });
    } catch (err) {
      removeTypingIndicator();
      // Show a friendly message for overloaded/transient errors
      let errorMsg;
      const rawMsg = (err.message || "").toLowerCase();
      if (rawMsg.includes("overload") || rawMsg.includes("busy") || rawMsg.includes("529")) {
        errorMsg = "I'm a little busy right now — please try again in a moment!";
      } else if (rawMsg.includes("failed to fetch") || rawMsg.includes("network")) {
        errorMsg = "It looks like there's a connection issue. Please check your internet and try again.";
      } else {
        errorMsg = err.message || "Something went wrong. Please try again.";
      }
      appendMessage("assistant", `⚠ ${errorMsg}`);
      // Remove the failed user message from history so the conversation stays clean
      conversationHistory.pop();
    } finally {
      isLoading = false;
      updateSendButton();
    }
  }

  // ── API Call (via proxy server) ──

  async function callAnthropicAPI() {
    if (
      !CHAT_PROXY_URL ||
      CHAT_PROXY_URL === "http://localhost:3000"
    ) {
      console.warn(
        "Chat widget: still using localhost. Update CHAT_PROXY_URL after deploying your server."
      );
    }

    const response = await fetch(`${CHAT_PROXY_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: conversationHistory,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const msg = errBody?.error || `Server error (${response.status})`;
      throw new Error(msg);
    }

    const data = await response.json();
    return data.reply || "I didn't get a response. Please try again.";
  }

  // ── DOM Helpers ──

  function appendMessage(role, text) {
    const messages = document.getElementById("chat-widget-messages");

    // Remove welcome message if present
    const welcome = messages.querySelector(".chat-welcome");
    if (welcome) welcome.remove();

    const wrapper = document.createElement("div");
    wrapper.className = `chat-message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = text;

    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTypingIndicator() {
    const messages = document.getElementById("chat-widget-messages");
    const typing = document.createElement("div");
    typing.className = "chat-typing";
    typing.id = "chat-typing-indicator";
    typing.innerHTML = `
      <div class="chat-bubble">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = document.getElementById("chat-typing-indicator");
    if (el) el.remove();
  }

  function updateSendButton() {
    const btn = document.getElementById("chat-widget-send-btn");
    btn.disabled = isLoading;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Initialize ──

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget);
  } else {
    createWidget();
  }
})();
