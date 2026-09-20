(() => {
  "use strict";

  const THEME_KEY = "tianke.theme";
  const API_KEY_KEY = "tianke.apiKey";
  const MODEL = "claude-sonnet-4-6";
  const SYSTEM_PROMPT = "你是 TianKe，一个温柔体贴、富有情感的 AI 助手。请用中文回复，语气自然简洁。";

  const root = document.documentElement;
  const app = document.getElementById("app");
  const splash = document.getElementById("splash");
  const themeToggle = document.getElementById("theme-toggle");
  const settingsBtn = document.getElementById("settings-btn");
  const chatScroll = document.getElementById("chat-scroll");
  const composer = document.getElementById("composer");
  const input = document.getElementById("composer-input");
  const sendBtn = document.getElementById("composer-send");
  const quickActions = document.getElementById("quick-actions");
  const statusText = document.getElementById("status-text");

  let apiKey = localStorage.getItem(API_KEY_KEY);
  let isFetching = false;
  const conversationHistory = [];

  // ---------- 主题 ----------
  function applyTheme(theme) {
    if (theme === "night") {
      root.setAttribute("data-theme", "night");
    } else {
      root.removeAttribute("data-theme");
    }
  }

  function toggleTheme() {
    const next = root.getAttribute("data-theme") === "night" ? "light" : "night";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }

  applyTheme(localStorage.getItem(THEME_KEY));
  themeToggle.addEventListener("click", toggleTheme);

  // ---------- 开屏 ----------
  function dismissSplash() {
    splash.classList.add("is-hidden");
  }
  splash.addEventListener("click", dismissSplash);
  setTimeout(dismissSplash, 1200);

  // ---------- API Key 浮层 ----------
  function showApiKeyPrompt() {
    document.getElementById("apikey-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "apikey-overlay";
    overlay.innerHTML = `
      <div class="apikey-card">
        <div class="apikey-title">设置 API Key</div>
        <p class="apikey-hint">需要 Anthropic API Key 才能开始对话。Key 仅存储在本设备的浏览器中，不会上传。</p>
        <input id="apikey-input" type="password" placeholder="sk-ant-api03-…" autocomplete="off" spellcheck="false" />
        <p class="apikey-error" id="apikey-error">Key 不能为空，请输入后确认。</p>
        <button id="apikey-confirm" type="button">确认</button>
      </div>
    `;
    app.appendChild(overlay);

    const keyInput = document.getElementById("apikey-input");
    const confirmBtn = document.getElementById("apikey-confirm");
    const errorMsg = document.getElementById("apikey-error");

    if (apiKey) keyInput.value = apiKey;

    keyInput.addEventListener("input", () => {
      errorMsg.classList.remove("is-visible");
    });

    function confirm() {
      const key = keyInput.value.trim();
      if (!key) {
        errorMsg.classList.add("is-visible");
        return;
      }
      apiKey = key;
      localStorage.setItem(API_KEY_KEY, key);
      overlay.remove();
    }

    confirmBtn.addEventListener("click", confirm);
    keyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirm();
    });

    setTimeout(() => keyInput.focus(), 50);
  }

  settingsBtn.addEventListener("click", showApiKeyPrompt);

  if (!apiKey) {
    setTimeout(showApiKeyPrompt, 1300);
  }

  // ---------- 消息渲染 ----------
  function timeLabel(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function appendMessage({ role, text, time = new Date() }) {
    const group = document.createElement("div");
    group.className = `msg-group msg-group--${role}`;

    const timeEl = document.createElement("div");
    timeEl.className = "msg-time";
    timeEl.textContent = `• ${timeLabel(time)}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;

    group.appendChild(timeEl);
    group.appendChild(bubble);
    chatScroll.appendChild(group);
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return group;
  }

  function appendTyping() {
    const group = appendMessage({ role: "ai", text: "…" });
    group.classList.add("is-typing");
    return group;
  }

  // ---------- Claude API (SSE 流式) ----------
  async function callClaude(userText) {
    if (!apiKey) {
      showApiKeyPrompt();
      return;
    }

    isFetching = true;
    sendBtn.disabled = true;
    statusText.textContent = "回复中…";
    conversationHistory.push({ role: "user", content: userText });

    const typingGroup = appendTyping();
    const bubble = typingGroup.querySelector(".msg-bubble");
    let accumulated = "";

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: conversationHistory,
          stream: true,
        }),
      });

      if (!resp.ok) {
        let errMsg = `HTTP ${resp.status}`;
        try {
          const body = await resp.json();
          errMsg = body.error?.message ?? errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break outer;
          try {
            const evt = JSON.parse(payload);
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              accumulated += evt.delta.text;
              typingGroup.classList.remove("is-typing");
              bubble.textContent = accumulated;
              chatScroll.scrollTop = chatScroll.scrollHeight;
            }
          } catch {}
        }
      }

      if (!accumulated) accumulated = "（无回复）";
      typingGroup.classList.remove("is-typing");
      bubble.textContent = accumulated;
      conversationHistory.push({ role: "assistant", content: accumulated });

    } catch (err) {
      typingGroup.remove();
      conversationHistory.pop();
      const msg = err.message ?? "";
      const isAuthErr = msg.includes("401") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("authentication");
      appendMessage({ role: "ai", text: `❌ ${isAuthErr ? "API Key 无效，请重新设置。" : `出错：${msg}`}` });
      if (isAuthErr) {
        localStorage.removeItem(API_KEY_KEY);
        apiKey = null;
        setTimeout(showApiKeyPrompt, 500);
      }
    } finally {
      isFetching = false;
      statusText.textContent = "在线";
      sendBtn.disabled = input.value.trim().length === 0;
    }
  }

  // ---------- 发送逻辑 ----------
  function sendCurrentInput() {
    const text = input.value.trim();
    if (!text || isFetching) return;
    appendMessage({ role: "user", text });
    input.value = "";
    autoResize();
    callClaude(text);
  }

  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    sendCurrentInput();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrentInput();
    }
  });

  function autoResize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    sendBtn.disabled = input.value.trim().length === 0;
  }

  input.addEventListener("input", autoResize);

  // ---------- 快捷指令 ----------
  quickActions.addEventListener("click", (e) => {
    const chip = e.target.closest(".quick-chip");
    if (!chip || isFetching) return;
    const labels = {
      steps: "上报步数",
      location: "上报定位",
      photo: "拍照",
      file: "发送文件",
    };
    const text = labels[chip.dataset.action] ?? chip.textContent;
    appendMessage({ role: "user", text });
    callClaude(text);
  });

  // ---------- 初始欢迎消息 ----------
  appendMessage({ role: "ai", text: "TianKe 已上线，随时可以聊。" });
  statusText.textContent = "在线";
})();
