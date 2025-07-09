let mcpToolRegistry = {};
let llmToolMatchingPrompt = ""; // LLM 도구 매칭 프롬프트 내용을 저장할 변수
let systemPrompt = ""; // 시스템 프롬프트 내용을 저장할 변수

// --- 파일 업로드 관련 변수 및 함수 시작 ---
let uploadedFiles = []; // 업로드된 파일들을 저장할 배열
const fileInput = document.getElementById("file-input");
const attachBtn = document.getElementById("attach-btn");
const uploadedFilesList = document.getElementById("uploaded-files-list");
const fileUploadSection = document.getElementById("file-upload-section");
const clearAllFilesBtn = document.getElementById("clear-all-files-btn");
const chatPanel = document.getElementById("chat-panel"); // chatPanel 요소 추가

// 파일 목록 UI 업데이트 함수
function updateUploadedFilesUI() {
  uploadedFilesList.innerHTML = ""; // 기존 목록 초기화
  if (uploadedFiles.length > 0) {
    fileUploadSection.classList.remove("hidden");
    clearAllFilesBtn.classList.remove("hidden");
    uploadedFiles.forEach((file, index) => {
      const fileTag = document.createElement("div");
      fileTag.className =
        "flex items-center bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full dark:bg-blue-900 dark:text-blue-300 mr-1 mb-1";
      fileTag.innerHTML = `
        <span>${file.name}</span>
        <button type="button" class="ml-2 text-blue-800 hover:text-blue-900" data-file-index="${index}">
          ×
        </button>
      `;
      uploadedFilesList.appendChild(fileTag);
    });
  } else {
    fileUploadSection.classList.add("hidden");
    clearAllFilesBtn.classList.add("hidden");
  }
}

// 첨부 파일 목록을 초기화하는 새로운 함수
function clearAttachedFiles() {
  uploadedFiles = [];
  fileInput.value = ""; // 파일 입력 필드의 값도 초기화
  updateUploadedFilesUI();
  console.log("Attached files cleared.");
}

// 단일 파일 삭제 핸들러
uploadedFilesList.addEventListener("click", (event) => {
  if (event.target.tagName === "BUTTON") {
    const index = parseInt(event.target.dataset.fileIndex);
    if (!isNaN(index)) {
      uploadedFiles.splice(index, 1); // 배열에서 파일 제거
      updateUploadedFilesUI(); // UI 업데이트
    }
  }
});

// "모두 삭제" 버튼 핸들러
clearAllFilesBtn.addEventListener("click", () => {
  clearAttachedFiles(); // 새 함수 호출
});

// "Attach" 버튼 클릭 시 숨겨진 파일 입력 필드 트리거
attachBtn?.addEventListener("click", () => {
  fileInput.click();
});

// 파일 입력 필드 변경 시 (파일 선택 완료)
fileInput.addEventListener("change", (event) => {
  const files = event.target.files;
  if (files.length > 0) {
    uploadedFiles = [...uploadedFiles, ...Array.from(files)];
    updateUploadedFilesUI();
    console.log("Attached Files:", uploadedFiles);
  }
});

// --- 드래그 앤 드롭 핸들러 시작 ---
chatPanel?.addEventListener("dragover", (event) => {
  event.preventDefault(); // 기본 동작 방지
  chatPanel.classList.add("border-blue-500", "border-2", "border-dashed"); // 시각적 피드백 추가
});

chatPanel?.addEventListener("dragleave", (event) => {
  event.preventDefault(); // 기본 동작 방지
  chatPanel.classList.remove("border-blue-500", "border-2", "border-dashed"); // 시각적 피드백 제거
});

chatPanel?.addEventListener("drop", (event) => {
  event.preventDefault(); // 기본 동작 방지
  chatPanel.classList.remove("border-blue-500", "border-2", "border-dashed"); // 시각적 피드백 제거

  const files = event.dataTransfer.files; // 드롭된 파일 가져오기
  if (files.length > 0) {
    uploadedFiles = [...uploadedFiles, ...Array.from(files)]; // 파일 추가
    updateUploadedFilesUI(); // UI 업데이트
    console.log("Dropped Files:", uploadedFiles);
  }
});
// --- 드래그 앤 드롭 핸들러 끝 ---

// --- 파일 업로드 관련 변수 및 함수 끝 ---

async function findToolViaLLM(prompt, tools) {
  const settings =
    window.settingsAPI?.load?.() ||
    JSON.parse(localStorage.getItem("chattron-settings") || "{}");

  const { apiUrl, modelName, apiKey, provider } = settings;
  if (!apiUrl || !modelName || !provider) {
    console.warn("❗ LLM configuration missing.");
    return null;
  }

  // MCP tool 목록에서 client/toolName 자동 추출
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

  // 통합된 프롬프트 - 단일/다중 자동 판단
  // 하드코딩된 문자열 대신 로드된 llmToolMatchingPrompt 사용
  const formattedLlmPrompt = llmToolMatchingPrompt
    .replace("{{CLIENT_LIST}}", JSON.stringify(clientList, null, 2))
    .replace("{{TOOL_LIST}}", JSON.stringify(toolList, null, 2))
    .replace("{{USER_PROMPT}}", prompt);

  const payload = {
    model: modelName,
    messages: [
      {
        role: "system",
        content:
          "You are a tool selector. Return either a single JSON object for one tool or a JSON array for multiple tools. Do NOT add any comments or explanatory text.",
      },
      { role: "user", content: formattedLlmPrompt },
    ],
    stream: false,
  };

  const headers = {
    "Content-Type": "application/json",
    ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
  };

  // 통합된 JSON 추출 함수 - 객체 또는 배열 처리
  function extractToolDataFromText(text) {
    console.log("🔍 Extracting tool data from text:", text);

    // 1. 전체 텍스트가 JSON인지 확인 (객체 또는 배열)
    try {
      const trimmedText = text.trim();
      const parsed = JSON.parse(trimmedText);

      // 배열인 경우
      if (Array.isArray(parsed)) {
        const validArray = parsed.filter(
          (item) =>
            item.client && item.toolName && typeof item.args === "object"
        );
        if (validArray.length > 0) {
          console.log("✅ Direct array parse successful:", validArray);
          return { type: "multiple", tools: validArray };
        }
      }
      // 객체인 경우
      else if (
        parsed.client &&
        parsed.toolName &&
        typeof parsed.args === "object"
      ) {
        console.log("✅ Direct object parse successful:", parsed);
        return { type: "single", tool: parsed };
      }
    } catch (e) {
      console.log("⚠️ Direct JSON parse failed, trying alternatives...");
    }

    // 2. Markdown code block 추출
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (markdownMatch) {
      try {
        const parsed = JSON.parse(markdownMatch[1]);

        if (Array.isArray(parsed)) {
          const validArray = parsed.filter(
            (item) =>
              item.client && item.toolName && typeof item.args === "object"
          );
          if (validArray.length > 0) {
            console.log("✅ Markdown array parse successful:", validArray);
            return { type: "multiple", tools: validArray };
          }
        } else if (
          parsed.client &&
          parsed.toolName &&
          typeof parsed.args === "object"
        ) {
          console.log("✅ Markdown object parse successful:", parsed);
          return { type: "single", tool: parsed };
        }
      } catch (e) {
        console.warn(
          "⚠️ JSON parse failed from markdown block:",
          markdownMatch[1]
        );
      }
    }

    // 3. 배열 패턴 먼저 찾기 (대괄호로 시작)
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) {
          const validArray = parsed.filter(
            (item) =>
              item.client && item.toolName && typeof item.args === "object"
          );
          if (validArray.length > 0) {
            console.log("✅ Array pattern parse successful:", validArray);
            return { type: "multiple", tools: validArray };
          }
        }
      } catch (e) {
        console.log("⚠️ Array pattern parse failed:", e.message);
      }
    }

    // 4. 객체 패턴 찾기 (중괄호 블록들)
    const jsonBlocks = [...text.matchAll(/\{[\s\S]*?\}/g)];
    console.log(`🔍 Found ${jsonBlocks.length} potential JSON blocks`);

    // 여러 객체가 있으면 배열로 처리
    const validObjects = [];
    for (const match of jsonBlocks) {
      try {
        const jsonText = match[0];
        const json = JSON.parse(jsonText);

        if (json.client && json.toolName && typeof json.args === "object") {
          validObjects.push(json);
        }
      } catch (e) {
        continue;
      }
    }

    if (validObjects.length > 1) {
      console.log(
        "✅ Multiple objects found, treating as array:",
        validObjects
      );
      return { type: "multiple", tools: validObjects };
    } else if (validObjects.length === 1) {
      console.log("✅ Single object found:", validObjects[0]);
      return { type: "single", tool: validObjects[0] };
    }

    console.log("❌ No valid tool data found in text");
    return null;
  }

  try {
    console.log("🛰️ Sending request to LLM:", { apiUrl, modelName, provider });

    const startTime = Date.now();

    const res = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseTime = Date.now() - startTime;
    console.log(`⏱️ Response received in ${responseTime}ms`);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("❌ HTTP Error Response:", {
        status: res.status,
        statusText: res.statusText,
        body: errorText,
      });
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    console.log("🧾 Full LLM response JSON object:", data);

    const text =
      data.choices?.[0]?.message?.content ||
      data.message?.content ||
      data.content ||
      data.response ||
      "";

    console.log("📩 Raw LLM response text:\n", text);

    const result = extractToolDataFromText(text);

    if (result) {
      // 유효성 검증 및 기존 구조에 맞게 반환
      if (result.type === "single") {
        const tool = result.tool;
        const validClient = clientList.includes(tool.client);
        const validTool = toolList.includes(tool.toolName);

        if (validClient && validTool) {
          console.log("✅ Single tool validated:", tool);
          // 기존 구조에 맞게 반환 (client, toolName, args)
          return {
            client: tool.client,
            toolName: tool.toolName,
            args: tool.args,
          };
        } else {
          console.warn("❌ Single tool validation failed:", {
            validClient,
            validTool,
            tool,
          });
        }
      } else if (result.type === "multiple") {
        const validTools = result.tools.filter(
          (tool) =>
            clientList.includes(tool.client) && toolList.includes(tool.toolName)
        );

        if (validTools.length > 0) {
          console.log(
            `✅ ${validTools.length}/${result.tools.length} tools validated:`,
            validTools
          );

          if (validTools.length < result.tools.length) {
            console.warn(
              `⚠️ ${
                result.tools.length - validTools.length
              } tools were filtered out due to validation failure`
            );
          }

          // 다중 도구 표시를 위해 특별한 구조로 반환
          return {
            isMultiple: true,
            tools: validTools,
            totalCount: validTools.length,
          };
        } else {
          console.warn("❌ No tools passed validation:", result.tools);
        }
      }
    }

    console.warn("❌ No valid tool configuration found");
    return null;
  } catch (err) {
    console.error("🚨 LLM tool matching error:", err);
    return null;
  }
}

// 다중 MCP 도구 실행 함수
async function executeMultipleTools(toolsConfig, prompt) {
  const { tools, totalCount } = toolsConfig;

  console.log(`🔄 Executing ${totalCount} tools sequentially...`);

  const results = [];

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];

    console.log(`📍 Executing tool ${i + 1}/${totalCount}:`, {
      client: tool.client,
      toolName: tool.toolName,
      args: tool.args,
    });

    // 각 도구별 실행 메시지 표시
    const executingMessage = renderMessage(
      `🛠️ Executing tool ${i + 1}/${totalCount}: ${tool.client}/${
        tool.toolName
      }...`,
      "system"
    );

    try {
      console.log("MCP CALL DEBUG", {
        client: tool.client,
        name: tool.toolName,
        args: tool.args,
      });

      const result = await window.mcpAPI.callTool({
        client: tool.client,
        name: tool.toolName,
        args: tool.args,
      });

      // 실행 메시지 제거
      if (executingMessage && executingMessage.parentNode) {
        executingMessage.remove();
      }

      // 결과 표시
      const resultMessage = `[${i + 1}/${totalCount}] ${tool.client}/${
        tool.toolName
      }: ${JSON.stringify(result, null, 2)}`;
      renderMessage(resultMessage, "assistant");

      results.push({
        index: i + 1,
        success: true,
        client: tool.client,
        toolName: tool.toolName,
        result: result,
      });

      console.log(`✅ Tool ${i + 1} executed successfully`);

      // 도구 실행 사이에 지연 (브라우저 작업의 경우 유용)
      if (i < tools.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error(`❌ Tool ${i + 1} execution failed:`, err);

      // 실행 메시지 제거
      if (executingMessage && executingMessage.parentNode) {
        executingMessage.remove();
      }

      // 에러 메시지 표시
      const errorMessage = `[${i + 1}/${totalCount}] ${tool.client}/${
        tool.toolName
      } Error: ${err.message}`;
      renderMessage(errorMessage, "system");

      results.push({
        index: i + 1,
        success: false,
        client: tool.client,
        toolName: tool.toolName,
        error: err.message,
      });

      // 실패한 경우에도 계속 진행 (설정에 따라 중단하려면 break 사용)
      // break;
    }
  }

  // 전체 실행 결과 요약
  const successCount = results.filter((r) => r.success).length;
  const summary = `✅ Multi-tool execution completed: ${successCount}/${totalCount} tools succeeded`;

  console.log("🎉 Multi-tool execution summary:", {
    results,
    successCount,
    totalCount,
  });

  // 요약을 히스토리에 저장
  saveToHistory(prompt, summary);

  return results;
}

// 수정된 MCP 동기화 코드 -> 기존에 Session Storage 삭제도 제대로 안되었고, 동기화에 문제가 있어 토글을 꺼도 MCP가 활성화 되어 있는 상태로 남아 있는 경우가 있었음
// 1. 개선된 buildMCPRegistry 함수 - sessionStorage 기반으로 변경
async function buildMCPRegistry() {
  mcpToolRegistry = {};

  // sessionStorage에서 활성화된 클라이언트 목록 가져오기
  const activeClients =
    JSON.parse(sessionStorage.getItem("active-clients")) || [];

  console.log("🔧 Building registry for active clients:", activeClients);

  for (const clientKey of activeClients) {
    try {
      // 실제 백엔드에서 해당 클라이언트가 활성화되어 있는지 확인
      const backendClients = await window.mcpAPI.getClients();

      if (backendClients.includes(clientKey)) {
        const { tools } = await window.mcpAPI.listTools(clientKey);
        mcpToolRegistry[clientKey] = tools || [];
        console.log(`✅ Added ${clientKey} with ${tools?.length || 0} tools`);
      } else {
        console.warn(`⚠️ Client ${clientKey} not active in backend, skipping`);
        // sessionStorage에서도 제거
        const updatedActiveClients = activeClients.filter(
          (c) => c !== clientKey
        );
        sessionStorage.setItem(
          "active-clients",
          JSON.stringify(updatedActiveClients)
        );
      }
    } catch (err) {
      console.warn(`❌ Tool fetch failed for ${clientKey}:`, err);
      // 실패한 클라이언트는 registry에서 제외
    }
  }

  console.log("📋 Registry built:", Object.keys(mcpToolRegistry));
}

// 2. 개선된 updateMCPUI 함수 - 실제 백엔드와 동기화
async function updateMCPUI() {
  const panel = document.getElementById("mcp-panel");
  if (!panel) return;

  const serverList =
    JSON.parse(sessionStorage.getItem("mcp-server-list")) || [];
  const activeClients =
    JSON.parse(sessionStorage.getItem("active-clients")) || [];

  panel.innerHTML = "";

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

  // 토글 이벤트 핸들러 - 실제 백엔드와 동기화
  panel.querySelectorAll("input[data-mcp-key]").forEach((toggle) => {
    toggle.onchange = async () => {
      const key = toggle.dataset.mcpKey;
      let activeClients =
        JSON.parse(sessionStorage.getItem("active-clients")) || [];

      try {
        if (toggle.checked) {
          console.log(`🔵 Activating MCP client: ${key}`);

          // 백엔드에서 실제 활성화
          await window.mcpAPI.activate(key);

          // 성공하면 sessionStorage에 추가
          if (!activeClients.includes(key)) {
            activeClients.push(key);
          }

          console.log(`✅ Successfully activated: ${key}`);
        } else {
          console.log(`🔴 Deactivating MCP client: ${key}`);

          // 백엔드에서 실제 비활성화
          await window.mcpAPI.deactivate(key);

          // 성공하면 sessionStorage에서 제거
          activeClients = activeClients.filter((c) => c !== key);

          console.log(`✅ Successfully deactivated: ${key}`);
        }

        // sessionStorage 업데이트
        sessionStorage.setItem("active-clients", JSON.stringify(activeClients));

        // Registry 재구성
        await buildMCPRegistry();

        // UI 재업데이트
        updateMCPUI();
      } catch (error) {
        console.error(
          `❌ Failed to ${toggle.checked ? "activate" : "deactivate"} ${key}:`,
          error
        );

        // 실패시 토글 상태 되돌리기
        toggle.checked = !toggle.checked;

        alert(
          `Failed to ${toggle.checked ? "activate" : "deactivate"} ${key}: ${
            error.message
          }`
        );
      }
    };
  });
}

// 3. 초기 동기화 함수 - 앱 시작시 백엔드와 sessionStorage 동기화
async function syncMCPState() {
  try {
    console.log("🔄 Syncing MCP state...");

    // 백엔드에서 실제 활성화된 클라이언트 목록 가져오기
    const backendActiveClients = await window.mcpAPI.getClients();

    // sessionStorage 업데이트
    sessionStorage.setItem(
      "active-clients",
      JSON.stringify(backendActiveClients)
    );

    console.log("✅ MCP state synced:", backendActiveClients);

    // Registry 빌드
    await buildMCPRegistry();

    // UI 업데이트
    updateMCPUI();
  } catch (error) {
    console.error("❌ Failed to sync MCP state:", error);
  }
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

  // DOM 요소를 반환
  return msg;
}

function getCurrentSessionId() {
  let sessionId = sessionStorage.getItem("current-session-id");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem("current-session-id", sessionId);
    console.log("New session ID created:", sessionId);
  }
  return sessionId;
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
    if (!Array.isArray(messages) || messages.length === 0) return;

    const firstPrompt = messages[0]?.prompt || "(empty)";
    const item = document.createElement("div");
    item.className =
      "flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm";

    item.onclick = () => {
      sessionStorage.setItem("current-session-id", sessionId);
      const chatPanel = document.getElementById("chat-panel");
      chatPanel.innerHTML = "";
      // Welcome 메시지 복원 (파일 업로드 섹션 아래에)
      chatPanel.innerHTML = `
        <h2 class="text-[28px] font-bold text-center pt-5 pb-3 text-[#0d141c]">Welcome to ChatTron</h2>
        <p class="text-base font-normal text-center pb-3 pt-1 text-[#0d141c]">
          Start a new chat or continue from your history.
        </p>
      `;
      loadHistory();
      // 히스토리 로드 후 파일 UI는 초기화 상태로
      clearAttachedFiles(); // 새 함수 호출
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
        clearAttachedFiles(); // 새 함수 호출
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
    clearAttachedFiles(); // 새 함수 호출
  };
  clearContainer.appendChild(clearBtn);
}

// Textarea 자동 크기 조절 함수들
function initializeTextareaAutoResize() {
  const textarea = document.getElementById("prompt-input");
  if (!textarea) return;

  function autoResize() {
    // Reset height to auto to get proper scrollHeight
    textarea.style.height = "auto";

    // Calculate new height (minimum 48px, maximum 200px)
    const newHeight = Math.max(48, Math.min(textarea.scrollHeight, 200));
    textarea.style.height = newHeight + "px";

    // Show/hide scrollbar when content exceeds max height
    if (textarea.scrollHeight > 200) {
      textarea.style.overflowY = "auto";
    } else {
      textarea.style.overflowY = "hidden";
    }
  }

  // Auto-resize on input
  textarea.addEventListener("input", autoResize);

  // Auto-resize on paste
  textarea.addEventListener("paste", function () {
    setTimeout(autoResize, 0);
  });

  // Reset textarea height after sending (전역 함수로 노출)
  window.resetTextareaHeight = function () {
    textarea.value = "";
    autoResize();
  };

  // Initial resize on page load
  autoResize();

  return autoResize;
}

// MCP 도구 목록을 가져와서 표시하는 함수
async function handleListMcpTools() {
  try {
    const activeClients = await window.mcpAPI.getClients();
    if (activeClients.length === 0) {
      renderMessage("No active MCP clients found.", "system");
      return;
    }

    let message = "Available MCP Tools:\n\n";

    for (const clientKey of activeClients) {
      try {
        const { tools } = await window.mcpAPI.listTools(clientKey);
        message += `[Client: ${clientKey}]\n`;
        if (tools && tools.length > 0) {
          tools.forEach(tool => {
            message += `- ${tool.name}: ${tool.description}\n`;
          });
        } else {
          message += "- No tools available\n";
        }
        message += "\n";
      } catch (err) {
        message += `[Client: ${clientKey}]\n- Error fetching tools: ${err.message}\n\n`;
      }
    }

    renderMessage(message, "assistant");

  } catch (err) {
    console.error("Failed to list MCP tools:", err);
    renderMessage("Error: " + err.message, "system");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const settingsBtn = document.getElementById("settings-btn");
  const dropdownMenu = document.getElementById("dropdown-menu");
  const apiSettingsLink = document.getElementById("api-settings-link");
  const mcpSettingsBtn = document.getElementById("mcp-section");
  const newChatBtn = document.getElementById("new-chat");
  const input = document.getElementById("prompt-input");
  const sendBtn = document.getElementById("send-btn");
  const listMcpToolsBtn = document.getElementById("mcp-tool-list-btn");

  // Textarea 자동 크기 조절 초기화
  initializeTextareaAutoResize();

  // 프롬프트 파일 로드
  try {
    llmToolMatchingPrompt = await window.promptAPI.loadPrompt("../src/prompts/mcp_tool_matching_prompt.txt");
    if (!llmToolMatchingPrompt) {
      console.warn("LLM tool matching prompt file not loaded. Using hardcoded fallback.");
      llmToolMatchingPrompt = `
You are a tool-matching engine. Analyze the user's request and determine if it needs one tool or multiple tools.

RESPONSE FORMATS:

1. For SINGLE tool requests, return a JSON object:
{
  "client": "<client key>",
  "toolName": "<tool name>",
  "args": {
    "<arg1>": "...",
    ...
  }
}

2. For MULTIPLE tool requests, return a JSON ARRAY:
[
  {
    "client": "<client key>",
    "toolName": "<tool name>",
    "args": {
      "<arg1>": "...",
      ...
    }
  },
  {
    "client": "<client key>",
    "toolName": "<tool name>",
    "args": {
      "<arg1>": "...",
      ...
    }
  }
]

RULES:
- If the request involves sequential actions (like "do X then Y" or "go to A then B"), return an ARRAY
- If the request is a single action, return a single OBJECT
- DO NOT invent tool names or client keys
- You MUST choose ONLY from the available options below

Valid client keys:
{{CLIENT_LIST}}

Valid tool names:
{{TOOL_LIST}}

User request:
"{{USER_PROMPT}}"
`;
    }

    systemPrompt = await window.promptAPI.loadPrompt("../src/prompts/custom/custom-prompt.txt");
    if (!systemPrompt) {
      console.warn("System prompt file not loaded. Using hardcoded fallback.");
      systemPrompt = "You are a helpful assistant.";
    }
  } catch (err) {
    console.error("Error loading prompt files:", err);
    // 오류 발생 시 기본값 사용
    llmToolMatchingPrompt = `
You are a tool-matching engine. Analyze the user's request and determine if it needs one tool or multiple tools.

RESPONSE FORMATS:

1. For SINGLE tool requests, return a JSON object:
{
  "client": "<client key>",
  "toolName": "<tool name>",
  "args": {
    "<arg1>": "...",
    ...
  }
}

2. For MULTIPLE tool requests, return a JSON ARRAY:
[
  {
    "client": "<client key>",
    "toolName": "<tool name>",
    "args": {
      "<arg1>": "...",
      ...
    }
  },
  {
    "client": "<client key>",
    "toolName": "<tool name>",
    "args": {
      "<arg1>": "...",
      ...
    }
  }
]

RULES:
- If the request involves sequential actions (like "do X then Y" or "go to A then B"), return an ARRAY
- If the request is a single action, return a single OBJECT
- DO NOT invent tool names or client keys
- You MUST choose ONLY from the available options below

Valid client keys:
{{CLIENT_LIST}}

Valid tool names:
{{TOOL_LIST}}

User request:
"{{USER_PROMPT}}"
`;
    systemPrompt = "You are a helpful assistant.";
  }


  // 메인 실행 로직을 별도 함수로 분리
  async function handlePromptSubmission() {
    let promptText = input.value.trim(); // 원본 텍스트 프롬프트
    if (!promptText && uploadedFiles.length === 0) return;

    renderMessage(promptText || "[Attached File]", "user");
    input.value = "";

    // LLM에 전송할 최종 콘텐츠를 담을 배열 (텍스트와 이미지를 분리하여 처리)
    const contentParts = [];

    if (promptText) {
        contentParts.push({ type: "text", text: promptText });
    }

    if (uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        if (file.type.startsWith("text/") || file.type === "application/json") {
          // 텍스트 및 JSON 파일 처리
          try {
            const reader = new FileReader();
            const content = await new Promise((resolve, reject) => {
              reader.onload = (e) => resolve(e.target.result);
              reader.onerror = (e) => reject(e);
              reader.readAsText(file); // 파일을 텍스트로 읽기
            });
            contentParts.push({
              type: "text",
              text: `\n\n--- Start of ${file.name} ---\n${content}\n--- End of ${file.name} ---`
            });
          } catch (error) {
            console.warn(`Failed to read text file ${file.name}:`, error);
            contentParts.push({
              type: "text",
              text: `\n\n--- Error reading ${file.name}: ${error.message} ---`
            });
          }
        } else if (file.type.startsWith("image/")) {
          // 이미지 파일 처리 (Base64 인코딩)
          try {
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
              reader.onload = (e) => resolve(e.target.result);
              reader.onerror = (e) => reject(e);
              reader.readAsDataURL(file); // 이미지를 Data URL (Base64)로 읽기
            });
            console.log(`Image ${file.name} read as Base64. Data URL: ${dataUrl.substring(0, 50)}...`);
            
            // 이곳에서 LLM API에 맞는 이미지 형식으로 contentParts에 추가해야 합니다.
            // 예를 들어 OpenAI의 경우:
            // contentParts.push({ type: "image_url", image_url: { url: dataUrl } });
            
            // 현재는 콘솔에 출력만 하고, LLM 프롬프트에는 포함하지 않습니다.
            // LLM이 멀티모달을 지원하지 않거나 API 형식이 맞지 않으면 오류가 발생할 수 있습니다.
            contentParts.push({
                type: "text",
                text: `\n\n--- Attached image: ${file.name} (type: ${file.type}). Base64 data read, but LLM API payload needs to be adjusted for multimodal input. ---`
            });

          } catch (error) {
            console.warn(`Failed to read image file ${file.name}:`, error);
            contentParts.push({
              type: "text",
              text: `\n\n--- Error reading image ${file.name}: ${error.message} ---`
            });
          }
        } else {
          // 기타 지원하지 않는 파일 형식
          contentParts.push({
            type: "text",
            text: `\n\n--- Attached file: ${file.name} (type: ${file.type}). Content not included due to unsupported format. ---`
          });
        }
      }
    }

    // LLM payload의 messages[0].content 필드를 단일 문자열 대신
    // `contentParts` 배열로 변경해야 합니다.
    // 이는 선택된 LLM 제공업체의 멀티모달 API 사양에 따라 달라집니다.
    // 현재 `payload` 구조는 단일 문자열 프롬프트만 가정하므로,
    // 아래 `payload` 변수 생성 부분을 LLM 제공업체에 맞게 변경해야 합니다.
    // 예: OpenAI 최신 모델의 경우:
    // payload.messages[0].content = contentParts;
    // ...

    // 임시로, 모든 contentParts를 단일 문자열로 결합하여 기존 prompt 변수를 대체합니다.
    // 이렇게 하면 이미지 데이터가 텍스트로 직렬화되어 LLM에 전달되지만,
    // LLM이 이를 이미지로 인식하지 못하고 단순히 문자열로 처리할 것입니다.
    let finalPrompt = contentParts.map(part => part.text || '').join('');
    // 만약 contentParts에 텍스트가 전혀 없고 이미지 파트만 있다면, 기본 메시지 추가
    if (!finalPrompt && contentParts.some(part => part.type.startsWith('image/'))) {
        finalPrompt = "[Image attached. Model needs multimodal support to process this.]";
    }
    if (!finalPrompt) return; // 모든 콘텐츠가 비어있으면 전송하지 않음

    // 이제 'prompt' 대신 'finalPrompt'를 LLM에 전달해야 합니다.
    // 아래 payload 생성 부분에서 prompt 대신 finalPrompt를 사용하도록 변경합니다.
    // ...

    // 로딩 상태 표시
    let loadingMessage = null;
    try {
      loadingMessage = renderMessage("🤔 Thinking...", "system");
    } catch (err) {
      console.warn("Could not create loading message:", err);
    }

    // 안전한 로딩 메시지 업데이트 함수
    function updateLoadingMessage(text) {
      if (loadingMessage && loadingMessage.textContent !== undefined) {
        loadingMessage.textContent = text;
      }
    }

    // 안전한 로딩 메시지 제거 함수
    function removeLoadingMessage() {
      if (loadingMessage && loadingMessage.parentNode) {
        loadingMessage.remove();
      }
    }

    try {
      let match = findMatchingTool(finalPrompt); // LLM 툴 매칭에도 finalPrompt 사용

      // 자연어 기반 MCP 툴 매칭 (fallback)
      if (!match) {
        console.log("🔍 No direct tool match found, trying LLM matching...");

        updateLoadingMessage("🧠 Analyzing request with LLM...");

        const llmMatch = await findToolViaLLM(finalPrompt, mcpToolRegistry); // LLM 매칭에도 finalPrompt 사용

        if (llmMatch) {
          console.log("✅ LLM found tool match:", llmMatch);

          // 다중 도구 처리
          if (llmMatch.isMultiple) {
            console.log(
              `🔄 Multiple tools detected (${llmMatch.totalCount} tools)`
            );

            // 로딩 메시지 제거
            removeLoadingMessage();

            // 다중 도구 실행
            await executeMultipleTools(llmMatch, finalPrompt); // 다중 도구 실행에도 finalPrompt 사용
            return;
          }
          // 단일 도구 처리 (기존 방식)
          else if (llmMatch.client && llmMatch.toolName) {
            const toolList = mcpToolRegistry[llmMatch.client] || [];
            const tool = toolList.find((t) => t.name === llmMatch.toolName);
            if (tool) {
              match = {
                client: llmMatch.client,
                tool,
                args:
                  llmMatch.args ||
                  extractArgsFromPrompt(finalPrompt, tool.inputSchema), // 인자 추출에도 finalPrompt 사용
              };
            }
          }
        }

        if (!match && !llmMatch?.isMultiple) {
          console.log("❌ LLM could not find a suitable tool match");
        }
      }

      // 로딩 메시지 제거
      removeLoadingMessage();

      // 단일 MCP 실행 (기존 방식)
      if (match) {
        console.log("🛠️ Executing single MCP tool...");
        const executingMessage = renderMessage(
          "🛠️ Executing tool...",
          "system"
        );

        try {
          const args =
            match.args || extractArgsFromPrompt(finalPrompt, match.tool.inputSchema); // 인자 추출에도 finalPrompt 사용

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

          // 실행 메시지 제거
          if (executingMessage && executingMessage.parentNode) {
            executingMessage.remove();
          }

          renderMessage(
            `[MCP:${match.client}] ${JSON.stringify(result, null, 2)}`,
            "assistant"
          );
          saveToHistory(finalPrompt, JSON.stringify(result)); // 히스토리에도 finalPrompt 저장
        } catch (err) {
          console.error("MCP execution error:", err);

          // 실행 메시지 제거
          if (executingMessage && executingMessage.parentNode) {
            executingMessage.remove();
          }

          renderMessage("MCP Error: " + err.message, "system");
        }
        return;
      }

      // fallback: LLM chat (기존 코드와 동일)
      console.log("💬 Falling back to direct LLM chat...");
      const chatMessage = renderMessage(
        "💬 Using direct LLM chat...",
        "system"
      );

      const settings =
        window.settingsAPI?.load?.() ||
        JSON.parse(localStorage.getItem("chattron-settings") || "{}");

      const { apiUrl, modelName, apiKey, provider } = settings;
      if (!apiUrl || !modelName || !provider) {
        // 챗 메시지 제거
        if (chatMessage && chatMessage.parentNode) {
          chatMessage.remove();
        }
        renderMessage("❌ API setting is missing.", "system");
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
                { role: "system", content: systemPrompt }, // 로드된 systemPrompt 사용
                { role: "user", content: finalPrompt }, // <-- finalPrompt 사용
              ],
              stream: false,
            };
            break;
          case "anthropic":
            payload = {
              model: modelName,
              messages: [{ role: "user", content: finalPrompt }], // <-- finalPrompt 사용
              stream: false,
              max_tokens: 1024,
            };
            break;
          default:
            if (chatMessage && chatMessage.parentNode) {
              chatMessage.remove();
            }
            renderMessage("❌ Unsupported provider.", "system");
            return;
        }

        const headers = {
          "Content-Type": "application/json",
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        };

        console.log("📤 Sending direct LLM request...");
        const startTime = Date.now();

        const res = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        const responseTime = Date.now() - startTime;
        console.log(`📥 LLM response received in ${responseTime}ms`);

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        console.log("📋 LLM response data:", data);

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

        // 챗 메시지 제거
        if (chatMessage && chatMessage.parentNode) {
          chatMessage.remove();
        }

        renderMessage(reply, "assistant");
        saveToHistory(finalPrompt, reply); // 히스토리에도 finalPrompt 저장
      } catch (err) {
        console.error("💥 Direct LLM chat error:", err);

        // 챗 메시지 제거
        if (chatMessage && chatMessage.parentNode) {
          chatMessage.remove();
        }

        renderMessage(
          "❌ Error occurred during API request: " + err.message,
          "system"
        );
      }
    } catch (err) {
      console.error("💥 General error in send handler:", err);

      // 모든 로딩 메시지 제거
      removeLoadingMessage();
      const systemMessages = document.querySelectorAll(".bg-yellow-100");
      systemMessages.forEach((msg) => {
        if (
          msg.textContent.includes("🤔") ||
          msg.textContent.includes("🧠") ||
          msg.textContent.includes("🛠️") ||
          msg.textContent.includes("💬")
        ) {
          msg.remove();
        }
      });

      renderMessage(
        "❌ An unexpected error occurred: " + err.message,
        "system"
      );
    } finally {
      // 성공/실패 여부와 관계없이 전송 시 파일 초기화
      clearAttachedFiles();
    }
  }

  // 기존 이벤트 핸들러들

  newChatBtn?.addEventListener("click", () => {
    // 1. 기존 세션 ID 제거 (세션을 비워 새로 시작)
    sessionStorage.removeItem("current-session-id");

    // 2. chat-panel Welcome 메시지 복원
    const chatPanel = document.getElementById("chat-panel");
    if (chatPanel) {
      chatPanel.innerHTML = `
      <h2 class="text-[28px] font-bold text-center pt-5 pb-3 text-[#0d141c]">Welcome to ChatTron</h2>
      <p class="text-base font-normal text-center pb-3 pt-1 text-[#0d141c]">
        Start a new chat or continue from your history.
      </p>
    `;
    }

    // 3. 입력창 초기화
    input.value = "";

    // 4. 히스토리 UI 갱신
    updateHistoryUI();

    // 5. 파일 목록 초기화
    clearAttachedFiles(); // 새 함수 호출

    console.log(
      "New Chat UI reset. Session ID will be created on first message."
    );
  });

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

  console.log("🚀 Initializing ChatTron...");

  try {
    await syncMCPState();
    loadHistory();
    updateHistoryUI();
    // 초기화 시 파일 UI도 업데이트
    clearAttachedFiles(); // 새 함수 호출
    console.log("✅ ChatTron initialization complete");
  } catch (error) {
    console.error("❌ Initialization failed:", error);
    await buildMCPRegistry();
    updateMCPUI();
    loadHistory();
    updateHistoryUI();
    // 초기화 시 파일 UI도 업데이트
    clearAttachedFiles(); // 새 함수 호출
  }

  // Send 버튼 클릭 이벤트
  sendBtn?.addEventListener("click", handlePromptSubmission);
  
  // MCP 도구 목록 버튼 클릭 이벤트
  listMcpToolsBtn?.addEventListener("click", handleListMcpTools);


  // Enter 키 이벤트 핸들러 추가
  input?.addEventListener("keydown", (event) => {
    // Enter 키가 눌렸을 때 (Shift+Enter는 제외)
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault(); // 기본 Enter 동작 방지 (줄바꿈 방지)
      handlePromptSubmission();
    }

    // Shift+Enter는 줄바꿈을 허용 (input이 textarea인 경우)
    // 별도 처리 불필요 - 기본 동작이 줄바꿈
  });

  // 현재 설정 표시 (기존 코드)
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