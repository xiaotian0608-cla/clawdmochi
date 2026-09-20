(() => {
  "use strict";

  const THEME_KEY = "tianke.theme";

  const root = document.documentElement;
  const splash = document.getElementById("splash");
  const themeToggle = document.getElementById("theme-toggle");
  const chatScroll = document.getElementById("chat-scroll");
  const composer = document.getElementById("composer");
  const input = document.getElementById("composer-input");
  const sendBtn = document.getElementById("composer-send");
  const quickActions = document.getElementById("quick-actions");
  const statusText = document.getElementById("status-text");

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
    const group = appendMessage({ role: "ai", text: "正在输入…" });
    group.classList.add("is-typing");
    return group;
  }

  // ---------- 发送逻辑 (占位: 之后接真实后端替换 mockReply) ----------
  function mockReply(userText) {
    const typing = appendTyping();
    setTimeout(() => {
      typing.remove();
      appendMessage({ role: "ai", text: `收到：${userText}` });
    }, 700);
  }

  function sendCurrentInput() {
    const text = input.value.trim();
    if (!text) return;
    appendMessage({ role: "user", text });
    input.value = "";
    autoResize();
    sendBtn.disabled = true;
    mockReply(text);
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

  // ---------- 快捷指令 (占位: 之后按 data-action 接真实数据源) ----------
  quickActions.addEventListener("click", (e) => {
    const chip = e.target.closest(".quick-chip");
    if (!chip) return;
    const labels = {
      steps: "上报步数",
      location: "上报定位",
      photo: "拍照",
      file: "发送文件",
    };
    appendMessage({ role: "user", text: labels[chip.dataset.action] ?? chip.textContent });
    mockReply(labels[chip.dataset.action] ?? chip.textContent);
  });

  // ---------- 初始欢迎消息 ----------
  appendMessage({ role: "ai", text: "TianKe 已上线，随时可以聊。" });
  statusText.textContent = "在线";
})();
