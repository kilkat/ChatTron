let mcpToolRegistry = {};

async function findToolViaLLM(prompt, tools) {
  const settings =
    window.settingsAPI?.load?.() ||
    JSON.parse(localStorage.getItem("chattron-settings") || "{}");

  const { apiUrl, modelName, apiKey, provider } = settings;
  if (!apiUrl || !modelName || !provider) {
    console.warn("❗ LLM configuration missing.");
    return null;
  }

  // ✅ MCP tool 목록에서 client/toolName 자동 추출
  const clientSet = new Set();
  const toolSet = new Set();

  for (const [client, toolList] of Object.entries(tools)) {
    clientSet.add(client);
    for (const tool of toolList) {
      toolSet.add(tool.name);
    }
  }

  const clientList = Array.from(clientSet);
  const toolList = Array.from(toolSet);

  // ✅ 프롬프트 구성
  const llmPrompt = `
You are a tool-matching engine. Based on the user's request, choose one of the available MCP tools and return the response STRICTLY in the following JSON format:

{
  "client": "<client key from below>",
  "toolName": "<tool name from below>",
  "args": {
    "<arg1>": "...",
    ...
  }
}

DO NOT invent tool names or client keys. You MUST choose ONLY from the following options:

Valid client keys:
${JSON.stringify(clientList, null, 2)}

Valid tool names:
${JSON.stringify(toolList, null, 2)}

User request:
"${prompt}"
`;

  const payload = {
    model: modelName,
    messages: [
      {
        role: "system",
        content:
          "You are a strict tool-to-JSON converter. Only return valid JSON using the allowed client/tool names. Do NOT add any comments or text.",
      },
      { role: "user", content: llmPrompt },
    ],
    stream: false,
  };

  const headers = {
    "Content-Type": "application/json",
    ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
  };

  // ✅ JSON 추출 함수
  function extractValidJsonFromText(text) {
    // 1. Markdown code block 추출
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (markdownMatch) {
      try {
        const parsed = JSON.parse(markdownMatch[1]);
        if (
          parsed.client &&
          parsed.toolName &&
          typeof parsed.args === "object"
        ) {
          return parsed;
        }
      } catch (e) {
        console.warn(
          "⚠️ JSON parse failed from markdown block:\n",
          markdownMatch[1]
        );
      }
    }

    // 2. 중괄호 블록 fallback
    const matches = [...text.matchAll(/\{[\s\S]*?\}/g)];
    for (const match of matches) {
      try {
        const json = JSON.parse(match[0]);
        if (json.client && json.toolName && typeof json.args === "object") {
          return json;
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  }

  try {
    console.log("🛰️ Sending request to LLM:", { apiUrl, modelName, provider });

    const res = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    console.log("🧾 Full LLM response JSON object:", data);

    const text =
      data.choices?.[0]?.message?.content ||
      data.message?.content ||
      data.content ||
      data.response ||
      "";

    console.log(
      "📩 Raw LLM response (stringified):\n",
      JSON.stringify(text, null, 2)
    );
    console.log("📩 Raw LLM response (plain text):\n", text);

    const parsed = extractValidJsonFromText(text);
    if (parsed) {
      // ✅ client/toolName validation against actual registry
      const validClient = clientList.includes(parsed.client);
      const validTool = toolList.includes(parsed.toolName);
      if (validClient && validTool) {
        console.log("✅ Parsed and validated JSON:", parsed);

        // 🚨 URL 자동 보정
        // if (parsed.args?.url && typeof parsed.args.url === "string") {
        //   if (!/^https?:\/\//i.test(parsed.args.url)) {
        //     parsed.args.url = "https://" + parsed.args.url;
        //   }
        // }

        return parsed;
      } else {
        console.warn(
          "❌ Parsed JSON contains invalid client or toolName.",
          parsed
        );
      }
    } else {
      console.warn("❌ No valid JSON matching MCP format found.");
    }

    return null;
  } catch (err) {
    console.error("🚨 LLM tool matching error:", err);
    return null;
  }
}

async function buildMCPRegistry() {
  mcpToolRegistry = {};
  const activeClients = await window.mcpAPI.getClients();

  for (const client of activeClients) {
    const clientKey = client?.key || client; // 문자열이면 그대로, 객체면 key 사용
    try {
      const { tools } = await window.mcpAPI.listTools(clientKey);
      mcpToolRegistry[clientKey] = tools || [];
    } catch (err) {
      console.warn("Tool fetch failed for:", clientKey, err);
    }
  }

  console.log("Registry built:", Object.keys(mcpToolRegistry));
}

function findMatchingTool(prompt) {
  const lower = prompt.toLowerCase();

  for (const [clientKey, tools] of Object.entries(mcpToolRegistry)) {
    for (const tool of tools) {
      const keywords = [tool.name, tool.description];
      if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        return { client: clientKey, tool };
      }
    }
  }

  return null;
}

function extractArgsFromPrompt(prompt, inputSchema) {
  const args = {};
  const props = inputSchema?.properties || {};

  for (const key of Object.keys(props)) {
    const match = new RegExp(`${key}\\s*[:=]\\s*([^\\s]+)`, "i").exec(prompt);
    if (match) args[key] = match[1];
  }

  return args;
}

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

async function updateMCPUI() {
  const panel = document.getElementById("mcp-panel");
  if (!panel) return;

  // sessionStorage에서 서버 목록 가져오기
  const serverList =
    JSON.parse(sessionStorage.getItem("mcp-server-list")) || [];
  const activeClients =
    JSON.parse(sessionStorage.getItem("active-clients")) || [];

  panel.innerHTML = "";

  // 서버 목록을 순회하며 UI 업데이트
  serverList.forEach((server) => {
    const key = server.key;
    const isActive = activeClients.includes(key);

    const div = document.createElement("div");

    div.className =
      "flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm";
    div.innerHTML = `
      <span>${server.name || key}</span>
      <label class="inline-flex items-center cursor-pointer">
        <input type="checkbox" class="sr-only peer" data-mcp-key="${key}" ${
      isActive ? "checked" : ""
    }>
        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-green-500"></div>
      </label>
    `;

    div.addEventListener("click", (e) => {
      if (
        e.target.closest("label") ||
        e.target.tagName.toLowerCase() === "input"
      ) {
        return;
      }

      sessionStorage.setItem("selected-mcp-key", key);
      window.location.href = "mcp.html";
    });

    panel.appendChild(div);
  });

  // 토글 상태 변경 시 활성화/비활성화 처리
  panel.querySelectorAll("input[data-mcp-key]").forEach((toggle) => {
    toggle.onchange = async () => {
      const key = toggle.dataset.mcpKey;
      if (toggle.checked) {
        // 활성화 시 activeClients에 추가
        activeClients.push(key);
      } else {
        // 비활성화 시 activeClients에서 제거
        const index = activeClients.indexOf(key);
        if (index !== -1) {
          activeClients.splice(index, 1);
        }
      }

      // 변경된 활성화된 클라이언트를 sessionStorage에 저장
      sessionStorage.setItem("active-clients", JSON.stringify(activeClients));

      // MCP 상태 변경 시 tool 목록 갱신
      await buildMCPRegistry(); // tool 목록 갱신 함수 호출
      updateMCPUI(); // UI 업데이트
    };
  });
}

// async function updateMCPUI() {
//   const panel = document.getElementById("mcp-panel");
//   if (!panel || !window.mcpAPI) return;

//   const config = await window.mcpAPI.getConfig();
//   const activeClients = await window.mcpAPI.getClients();
//   panel.innerHTML = "";

//   Object.entries(config.mcpServers || {}).forEach(([key, server]) => {
//     const div = document.createElement("div");
//     const isActive = activeClients.includes(key);

//     div.className =
//       "flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm";
//     div.innerHTML = `
//       <span>${server.name || key}</span>
//       <label class="inline-flex items-center cursor-pointer">
//         <input type="checkbox" class="sr-only peer" data-mcp-key="${key}" ${
//       isActive ? "checked" : ""
//     }>
//         <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-green-500"></div>
//       </label>
//     `;

//     div.addEventListener("click", (e) => {
//       if (
//         e.target.closest("label") ||
//         e.target.tagName.toLowerCase() === "input"
//       ) {
//         return;
//       }

//       sessionStorage.setItem("selected-mcp-key", key);
//       window.location.href = "mcp.html";
//     });

//     panel.appendChild(div);
//   });

//   panel.querySelectorAll("input[data-mcp-key]").forEach((toggle) => {
//     toggle.onchange = async () => {
//       const key = toggle.dataset.mcpKey;
//       if (toggle.checked) {
//         await window.mcpAPI.activate(key);
//       } else {
//         await window.mcpAPI.deactivate(key);
//       }
//       await buildMCPRegistry(); // MCP 상태 변경 시 tool 목록 갱신
//       updateMCPUI();
//     };
//   });
// }

document.addEventListener("DOMContentLoaded", async () => {
  const settingsBtn = document.getElementById("settings-btn");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const apiSettingsLink = document.getElementById("api-settings-link");
  const mcpSettingsBtn = document.getElementById("mcp-section");
  const newChatBtn = document.getElementById("new-chat");
  const input = document.getElementById("prompt-input");
  const sendBtn = document.getElementById("send-btn");

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

  mcpSettingsBtn?.addEventListener("click", () => {
    sessionStorage.removeItem("selected-mcp-key");
    window.location.href = "mcp.html";
  });

  try {
    window.mcpBridgeAPI?.launchBridge();
  } catch (err) {
    alert("MCP Agent 자동 실행 실패: " + err.message);
    console.warn("MCP Agent 자동 실행 실패:", err.message);
  }

  await buildMCPRegistry();
  updateMCPUI();
  loadHistory();
  updateHistoryUI();

  sendBtn?.addEventListener("click", async () => {
    const prompt = input.value.trim();
    if (!prompt) return;

    renderMessage(prompt, "user");
    input.value = "";

    let match = findMatchingTool(prompt);

    // 🧠 자연어 기반 MCP 툴 매칭 (fallback)
    if (!match) {
      const llmMatch = await findToolViaLLM(prompt, mcpToolRegistry);
      if (llmMatch?.client && llmMatch?.toolName) {
        const toolList = mcpToolRegistry[llmMatch.client] || [];
        const tool = toolList.find((t) => t.name === llmMatch.toolName);
        if (tool) {
          match = {
            client: llmMatch.client,
            tool,
            args:
              llmMatch.args || extractArgsFromPrompt(prompt, tool.inputSchema),
          };
        }
      }
    }

    // ✅ MCP 실행
    if (match) {
      try {
        const args =
          match.args || extractArgsFromPrompt(prompt, match.tool.inputSchema);

        console.log("MCP CALL DEBUG", {
          client: match.client,
          name: match.tool.name,
          args,
        });

        const result = await window.mcpAPI.callTool({
          client: match.client,
          name: match.tool.name,
          args,
        });

        renderMessage(
          `[MCP:${match.client}] ${JSON.stringify(result)}`,
          "assistant"
        );
        saveToHistory(prompt, JSON.stringify(result));
      } catch (err) {
        renderMessage("MCP Error: " + err.message, "system");
      }
      return;
    }

    // ❗ fallback: LLM chat
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
