document.addEventListener("DOMContentLoaded", () => {
  const keyInput = document.getElementById("tool-key");
  const nameInput = document.getElementById("tool-name");
  const descInput = document.getElementById("tool-description");
  const cmdInput = document.getElementById("tool-command");
  const argsInput = document.getElementById("tool-args");
  const jsonPreview = document.getElementById("mcp-json-preview");

  const saveBtn = document.getElementById("save-mcp-btn");
  const deleteBtn = document.getElementById("delete-mcp-btn");
  const backBtn = document.getElementById("back-btn");
  const loaderOverlay = document.getElementById("loader-overlay");

  // --- 스피너 제어 함수 ---
  // 스피너를 보여주는 유일한 함수
  function showLoader() {
    console.log("✅ [DEBUG] Showing loader...");
    if (loaderOverlay) {
      loaderOverlay.classList.remove("hidden");
    }
  }

  // 스피너를 숨기는 유일한 함수
  function hideLoader() {
    console.log("✅ [DEBUG] Hiding loader...");
    if (loaderOverlay) {
      loaderOverlay.classList.add("hidden");
    }
  }

  // 페이지 로드 시에는 스피너가 항상 숨겨져 있도록 강제합니다.
  hideLoader();

  // 1. JSON 입력 시 → 각 필드에 값 반영
  jsonPreview.addEventListener("input", () => {
    try {
      const obj = JSON.parse(jsonPreview.value);
      keyInput.value = obj.key || "";
      nameInput.value = obj.name || "";
      descInput.value = obj.description || "";
      cmdInput.value = obj.command || "";
      argsInput.value = (obj.args || []).join(", ");
    } catch (e) {
      // JSON 파싱 에러는 무시
    }
  });

  // 2. 각 필드 입력 시 → JSON 미리보기 갱신
  function updateJsonPreview() {
    const server = {
      key: keyInput.value.trim(),
      name: nameInput.value.trim(),
      description: descInput.value.trim(),
      command: cmdInput.value.trim(),
      args: argsInput.value
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    };
    jsonPreview.value = JSON.stringify(server, null, 2);
  }

  [keyInput, nameInput, descInput, cmdInput, argsInput].forEach((el) =>
    el.addEventListener("input", updateJsonPreview)
  );

  // 3. 저장 버튼 클릭 시에만 스피너 동작하도록 수정
  saveBtn.addEventListener("click", async () => {
    const server = {
      key: keyInput.value.trim(),
      name: nameInput.value.trim(),
      description: descInput.value.trim(),
      command: cmdInput.value.trim(),
      args: argsInput.value
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    };

    if (!server.key) return alert("Key is required");
    if (!server.command) return alert("Command is required");

    // 로딩 상태 시작 (오직 여기서만 showLoader 호출)
    showLoader();

    try {
      console.log("Saving server configuration:", server);

      let serverList =
        JSON.parse(sessionStorage.getItem("mcp-server-list")) || [];
      const existingIndex = serverList.findIndex((s) => s.key === server.key);
      if (existingIndex >= 0) {
        serverList[existingIndex] = server;
      } else {
        serverList.push(server);
      }
      sessionStorage.setItem("mcp-server-list", JSON.stringify(serverList));

      try {
        await window.mcpAPI.addServer(server);
      } catch (e) {
        if (/already exists/.test(e.message)) {
          await window.mcpAPI.updateServer(server);
        } else {
          throw e;
        }
      }

      await window.mcpAPI.activate(server);
      alert("Server saved and activated successfully.");

      let activeClients =
        JSON.parse(sessionStorage.getItem("active-clients")) || [];
      if (!activeClients.includes(server.key)) {
        activeClients.push(server.key);
        sessionStorage.setItem("active-clients", JSON.stringify(activeClients));
      }
    } catch (err) {
      console.error("Save/activate error:", err);
      alert("Failed to save or activate: " + err.message);
    } finally {
      // 로딩 상태 종료 (오직 여기서만 hideLoader 호출)
      hideLoader();
    }

    updateJsonPreview();
  });

  // 4. 삭제 버튼 → MCP 서버 삭제
  deleteBtn.addEventListener("click", async () => {
    const selectedKey = sessionStorage.getItem("selected-mcp-key");
    if (!selectedKey) return alert("No MCP selected to delete");

    console.log(`🗑️ Starting deletion process for server: ${selectedKey}`);

    try {
      await window.mcpAPI.removeServer(selectedKey);
      console.log(`✅ Backend removal successful`);

      let serverList =
        JSON.parse(sessionStorage.getItem("mcp-server-list")) || [];
      serverList = serverList.filter((server) => server.key !== selectedKey);
      sessionStorage.setItem("mcp-server-list", JSON.stringify(serverList));

      let activeClients =
        JSON.parse(sessionStorage.getItem("active-clients")) || [];
      activeClients = activeClients.filter((key) => key !== selectedKey);
      sessionStorage.setItem("active-clients", JSON.stringify(activeClients));

      sessionStorage.removeItem("selected-mcp-key");
      alert("Server deleted successfully!");
      window.location.href = "index.html";
    } catch (err) {
      console.error("❌ Failed to delete server:", err);
      alert(`Failed to delete server: ${err.message}`);
    }
  });

  // 5. 뒤로가기 버튼 → index.html로 이동
  backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // 6. 초기 상태에서도 preview 동기화
  updateJsonPreview();

  // 7. 선택된 MCP 값 불러오기 (스피너 로직 없음)
  (async () => {
    const selectedKey = sessionStorage.getItem("selected-mcp-key");
    if (selectedKey && window.mcpAPI?.getConfig) {
      console.log("[DEBUG] Loading existing MCP config on page load. No loader should be active.");
      try {
        const config = await window.mcpAPI.getConfig();
        const server = config.mcpServers?.[selectedKey];
        if (server) {
          keyInput.value = server.key || "";
          nameInput.value = server.name || "";
          descInput.value = server.description || "";
          cmdInput.value = server.command || "";
          argsInput.value = (server.args || []).join(", ");
          updateJsonPreview();
        }
      } catch (err) {
        console.error("Failed to load MCP config:", err);
      }
    }
  })();
});