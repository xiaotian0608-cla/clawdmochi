(() => {
  "use strict";

  const THEME_KEY   = "tianke.theme";
  const KEY_APIKEY  = "tianke.apiKey";
  const KEY_BASE    = "tianke.apiBase";
  const KEY_MODEL   = "tianke.model";

  const DEFAULT_BASE  = "https://api.deepseek.com";
  const DEFAULT_MODEL = "deepseek-chat";
  const SYSTEM_PROMPT = "你是 TianKe，一个温柔体贴、富有情感的 AI 助手。请用中文回复，语气自然简洁。";

  const root        = document.documentElement;
  const app         = document.getElementById("app");
  const splash      = document.getElementById("splash");
  const themeToggle = document.getElementById("theme-toggle");
  const settingsBtn = document.getElementById("settings-btn");
  const chatScroll  = document.getElementById("chat-scroll");
  const composer    = document.getElementById("composer");
  const input       = document.getElementById("composer-input");
  const sendBtn     = document.getElementById("composer-send");
  const quickActions= document.getElementById("quick-actions");
  const statusText  = document.getElementById("status-text");

  function ls(key, fallback = null) {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch {}
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  let apiKey  = ls(KEY_APIKEY);
  let apiBase = ls(KEY_BASE, DEFAULT_BASE);
  let model   = ls(KEY_MODEL, DEFAULT_MODEL);
  let isFetching = false;
  const conversationHistory = [];

  // ---------- 主题 ----------
  function applyTheme(t) {
    if (t === "night") root.setAttribute("data-theme", "night");
    else root.removeAttribute("data-theme");
  }
  applyTheme(ls(THEME_KEY));
  themeToggle.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "night" ? "light" : "night";
    applyTheme(next);
    lsSet(THEME_KEY, next);
  });

  // ---------- 开屏 ----------
  function dismissSplash() { splash.classList.add("is-hidden"); }
  splash.addEventListener("click", dismissSplash);
  setTimeout(dismissSplash, 1200);

  // ---------- 设置浮层 ----------
  const PRESETS = [
    { label: "DeepSeek",   base: "https://api.deepseek.com",   model: "deepseek-chat" },
    { label: "Meimaobing", base: "https://api.meimaobing.ai",  model: "claude-sonnet-4-5" },
    { label: "OpenAI",     base: "https://api.openai.com",     model: "gpt-4o-mini" },
  ];

  function showApiKeyPrompt() {
    document.getElementById("apikey-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "apikey-overlay";
    overlay.innerHTML = `
      <div class="apikey-card">
        <div class="apikey-title">接口设置</div>
        <div class="apikey-presets" id="apikey-presets">
          ${PRESETS.map((p, i) => `<button class="apikey-preset" type="button" data-idx="${i}">${p.label}</button>`).join("")}
        </div>
        <label class="apikey-label">接口地址
          <input id="apikey-base" type="url" placeholder="https://api.deepseek.com" autocomplete="off" spellcheck="false" />
        </label>
        <label class="apikey-label">API Key
          <input id="apikey-input" type="password" placeholder="sk-…" autocomplete="off" spellcheck="false" />
        </label>
        <label class="apikey-label">模型
          <input id="apikey-model" type="text" placeholder="deepseek-chat" autocomplete="off" spellcheck="false" />
        </label>
        <p class="apikey-error" id="apikey-error">请填写接口地址和 Key。</p>
        <button id="apikey-confirm" type="button">确认</button>
      </div>
    `;
    app.appendChild(overlay);

    const baseInput  = overlay.querySelector("#apikey-base");
    const keyInput   = overlay.querySelector("#apikey-input");
    const modelInput = overlay.querySelector("#apikey-model");
    const confirmBtn = overlay.querySelector("#apikey-confirm");
    const errorMsg   = overlay.querySelector("#apikey-error");

    baseInput.value  = apiBase;
    if (apiKey) keyInput.value = apiKey;
    modelInput.value = model;

    overlay.querySelector("#apikey-presets").addEventListener("click", (e) => {
      const btn = e.target.closest(".apikey-preset");
      if (!btn) return;
      const p = PRESETS[+btn.dataset.idx];
      baseInput.value  = p.base;
      modelInput.value = p.model;
      keyInput.focus();
    });

    [baseInput, keyInput, modelInput].forEach(el =>
      el.addEventListener("input", () => errorMsg.classList.remove("is-visible"))
    );

    function confirm() {
      const base = baseInput.value.trim().replace(/\/$/, "");
      const key  = keyInput.value.trim();
      const mdl  = modelInput.value.trim() || DEFAULT_MODEL;
      if (!base || !key) { errorMsg.classList.add("is-visible"); return; }
      apiBase = base; apiKey = key; model = mdl;
      lsSet(KEY_BASE, base); lsSet(KEY_APIKEY, key); lsSet(KEY_MODEL, mdl);
      overlay.remove();
    }

    confirmBtn.addEventListener("click", confirm);
    [baseInput, keyInput, modelInput].forEach(el =>
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") confirm(); })
    );
    setTimeout(() => (apiKey ? keyInput : baseInput).focus(), 50);
  }

  settingsBtn.addEventListener("click", showApiKeyPrompt);
  if (!apiKey) setTimeout(showApiKeyPrompt, 1300);

  // ---------- 消息渲染 ----------
  function timeLabel(date) {
    const pad = n => String(n).padStart(2, "0");
    return `${pad(date.getMonth()+1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function appendMessage({ role, text }) {
    const group  = document.createElement("div");
    group.className = `msg-group msg-group--${role}`;
    const timeEl = document.createElement("div");
    timeEl.className = "msg-time";
    timeEl.textContent = `• ${timeLabel(new Date())}`;
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
    const g = appendMessage({ role: "ai", text: "…" });
    g.classList.add("is-typing");
    return g;
  }

  // ---------- AI 调用 (OpenAI 兼容 SSE) ----------
  async function callAI(userText) {
    if (!apiKey) { showApiKeyPrompt(); return; }

    isFetching = true;
    sendBtn.disabled = true;
    statusText.textContent = "回复中…";
    conversationHistory.push({ role: "user", content: userText });

    const typingGroup = appendTyping();
    const bubble = typingGroup.querySelector(".msg-bubble");
    let accumulated = "";

    try {
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory,
      ];

      const resp = await fetch(`${apiBase}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: 1024, messages, stream: true }),
      });

      if (!resp.ok) {
        let errMsg = `HTTP ${resp.status}`;
        try { const b = await resp.json(); errMsg = b.error?.message ?? errMsg; } catch {}
        throw new Error(errMsg);
      }

      const reader  = resp.body.getReader();
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
            const evt  = JSON.parse(payload);
            const text = evt.choices?.[0]?.delta?.content;
            if (text) {
              accumulated += text;
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
      const isAuth = msg.includes("401") || msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("authentication");
      appendMessage({ role: "ai", text: `❌ ${isAuth ? "Key 无效，请重新设置。" : `出错：${msg}`}` });
      if (isAuth) { lsDel(KEY_APIKEY); apiKey = null; setTimeout(showApiKeyPrompt, 500); }
    } finally {
      isFetching = false;
      statusText.textContent = "在线";
      sendBtn.disabled = input.value.trim().length === 0;
    }
  }

  // ---------- 发送 ----------
  function sendCurrentInput() {
    const text = input.value.trim();
    if (!text || isFetching) return;
    appendMessage({ role: "user", text });
    input.value = "";
    autoResize();
    callAI(text);
  }

  composer.addEventListener("submit", (e) => { e.preventDefault(); sendCurrentInput(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendCurrentInput(); }
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
    const labels = { steps: "上报步数", location: "上报定位", photo: "拍照", file: "发送文件" };
    const text = labels[chip.dataset.action] ?? chip.textContent;
    appendMessage({ role: "user", text });
    callAI(text);
  });

  appendMessage({ role: "ai", text: "TianKe 已上线，随时可以聊。" });
  statusText.textContent = "在线";
})();
