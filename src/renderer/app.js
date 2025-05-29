function renderMessage(text, sender) {
  const chatPanel = document.getElementById("chat-panel");
  const msg = document.createElement("div");

  msg.className = `my-2 p-3 rounded-lg max-w-[80%] whitespace-pre-wrap ${
    sender === "user"
      ? "bg-blue-100 self-end"
      : sender === "assistant"
      ? "bg-gray-200 self-start"
      : "bg-yellow-100 text-red-700 self-center"
  }`;
  msg.textContent = text;
  chatPanel.appendChild(msg);
  msg.scrollIntoView({ behavior: "smooth", block: "end" });

  const welcomeHeading = chatPanel.querySelector("h2");
  const welcomeText = chatPanel.querySelector("p");
  if (welcomeHeading) welcomeHeading.remove();
  if (welcomeText) welcomeText.remove();
}

function getCurrentSessionId() {
  return sessionStorage.getItem("current-session-id") || "default";
}

function saveToHistory(prompt, reply) {
  const sessionId = getCurrentSessionId();
  const allHistory = JSON.parse(
    localStorage.getItem("chattron-history") || "{}"
  );
  if (!allHistory[sessionId]) allHistory[sessionId] = [];
  allHistory[sessionId].push({
    prompt,
    reply,
    timestamp: new Date().toISOString(),
  });
  localStorage.setItem("chattron-history", JSON.stringify(allHistory));

  updateHistoryUI();
}

function loadHistory() {
  const sessionId = getCurrentSessionId();
  const allHistory = JSON.parse(
    localStorage.getItem("chattron-history") || "{}"
  );
  const history = allHistory[sessionId] || [];
  history.forEach(({ prompt, reply }) => {
    renderMessage(prompt, "user");
    renderMessage(reply, "assistant");
  });
}

function updateHistoryUI() {
  const panel = document.getElementById("history-panel");
  if (!panel) return;
  panel.innerHTML = "";

  const allHistory = JSON.parse(
    localStorage.getItem("chattron-history") || "{}"
  );

  Object.entries(allHistory).forEach(([sessionId, messages]) => {
    const firstPrompt = messages[0]?.prompt || "(empty)";
    const item = document.createElement("div");
    item.className =
      "flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm";

    // 전체 item 클릭 시 세션 변경
    item.onclick = () => {
      sessionStorage.setItem("current-session-id", sessionId);
      const chatPanel = document.getElementById("chat-panel");
      chatPanel.innerHTML = "";
      loadHistory();
    };

    const textSpan = document.createElement("span");
    textSpan.textContent = firstPrompt;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "✖";
    deleteBtn.className = "text-red-500 hover:text-red-700 ml-2";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      delete allHistory[sessionId];
      localStorage.setItem("chattron-history", JSON.stringify(allHistory));
      updateHistoryUI();
      if (getCurrentSessionId() === sessionId) {
        const chatPanel = document.getElementById("chat-panel");
        chatPanel.innerHTML = `
          <h2 class="text-[28px] font-bold text-center pt-5 pb-3 text-[#0d141c]">Welcome to ChatTron</h2>
          <p class="text-base font-normal text-center pb-3 pt-1 text-[#0d141c]">
            Start a new chat or continue from your history.
          </p>
        `;
      }
    };

    item.appendChild(textSpan);
    item.appendChild(deleteBtn);
    panel.appendChild(item);
  });

  // Move Clear History outside of history-panel to bottom
  let clearContainer = document.getElementById("history-clear-container");
  if (!clearContainer) {
    clearContainer = document.createElement("div");
    clearContainer.id = "history-clear-container";
    clearContainer.className = "mt-auto pt-2";
    document
      .querySelector(".w-80.flex.flex-col.p-4")
      .appendChild(clearContainer);
  }
  clearContainer.innerHTML = "";

  const clearBtn = document.createElement("button");
  clearBtn.textContent = "Clear History";
  clearBtn.className =
    "mt-4 min-w-[100%] px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 flex justify-center items-center";
  clearBtn.onclick = () => {
    localStorage.removeItem("chattron-history");
    sessionStorage.removeItem("current-session-id");
    panel.innerHTML = "";
    const chatPanel = document.getElementById("chat-panel");
    chatPanel.innerHTML = `
      <h2 class="text-[28px] font-bold text-center pt-5 pb-3 text-[#0d141c]">Welcome to ChatTron</h2>
      <p class="text-base font-normal text-center pb-3 pt-1 text-[#0d141c]">
        Start a new chat or continue from your history.
      </p>
    `;
  };
  clearContainer.appendChild(clearBtn);
}

document.addEventListener("DOMContentLoaded", () => {
  const settingsBtn = document.getElementById("settings-btn");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const apiSettingsLink = document.getElementById("api-settings-link");
  const newChatBtn = document.getElementById("new-chat");

  settingsBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle("hidden");
  });

  document.addEventListener("click", () => {
    dropdownMenu?.classList.add("hidden");
  });

  apiSettingsLink?.addEventListener("click", () => {
    window.location.href = "settings.html";
  });

  newChatBtn?.addEventListener("click", () => {
    const newSessionId = Date.now().toString();
    sessionStorage.setItem("current-session-id", newSessionId);
    const chatPanel = document.getElementById("chat-panel");
    chatPanel.innerHTML = `
      <h2 class="text-[28px] font-bold text-center pt-5 pb-3 text-[#0d141c]">Welcome to ChatTron</h2>
      <p class="text-base font-normal text-center pb-3 pt-1 text-[#0d141c]">
        Start a new chat or continue from your history.
      </p>
    `;
  });

  const input = document.getElementById("prompt-input");
  const sendBtn = document.getElementById("send-btn");

  loadHistory();
  updateHistoryUI();

  sendBtn?.addEventListener("click", async () => {
    const prompt = input.value.trim();
    if (!prompt) return;

    renderMessage(prompt, "user");
    input.value = "";

    const settings =
      window.settingsAPI?.load?.() ||
      JSON.parse(localStorage.getItem("chattron-settings") || "{}");
    const { apiUrl, modelName, apiKey, provider } = settings;

    if (!apiUrl || !modelName || !provider) {
      renderMessage("API setting is missing.", "system");
      return;
    }

    let payload = {};
    let reply = "";

    try {
      switch (provider) {
        case "openai":
        case "ollama":
        case "localfastapi":
        case "custom":
          payload = {
            model: modelName,
            messages: [
              { role: "system", content: "You are a helpful assistant." },
              { role: "user", content: prompt },
            ],
            stream: false,
          };
          break;
        case "anthropic":
          payload = {
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            max_tokens: 1024,
          };
          break;
        default:
          renderMessage("Unsupported provider.", "system");
          return;
      }

      const headers = {
        "Content-Type": "application/json",
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      };

      const res = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      switch (provider) {
        case "openai":
          reply = data.choices?.[0]?.message?.content || "No response";
          break;
        case "ollama":
          reply = data.message?.content || data.response || "No response";
          break;
        case "anthropic":
          reply = data.content || "No response";
          break;
        case "localfastapi":
        case "custom":
          reply =
            data.choices?.[0]?.message?.content ||
            data.message?.content ||
            data.content ||
            data.response ||
            data.text ||
            (typeof data === "string" ? data : JSON.stringify(data));
          break;
      }

      renderMessage(reply, "assistant");
      saveToHistory(prompt, reply);
    } catch (err) {
      console.error("chatting error:", err);
      renderMessage("Error occurred during API request.", "system");
    }
  });

  const settings =
    window.settingsAPI?.load?.() ||
    JSON.parse(localStorage.getItem("chattron-settings") || "{}");

  if (settings.apiUrl || settings.modelName || settings.provider) {
    const settingsDiv = document.getElementById("current-settings");
    if (settingsDiv) {
      settingsDiv.innerHTML = `
        <div class="text-gray-500 text-xs mt-1">
          <div><strong>Provider:</strong> ${settings.provider}</div>
          <div><strong>API URL:</strong> ${settings.apiUrl}</div>
          <div><strong>Model:</strong> ${settings.modelName}</div>
        </div>
      `;
    }
  }
});
