document.addEventListener("DOMContentLoaded", () => {
  const keyInput = document.getElementById("tool-key");
  const nameInput = document.getElementById("tool-name");
  const descInput = document.getElementById("tool-description");
  const cmdInput = document.getElementById("tool-command");
  const argsInput = document.getElementById("tool-args");
  const jsonPreview = document.getElementById("mcp-json-preview");

  const saveBtn = document.getElementById("save-mcp-btn");
  const deleteBtn = document.getElementById("delete-mcp-btn"); // 삭제 버튼
  const backBtn = document.getElementById("back-btn");

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

  // 3. 저장 버튼 → MCP 서버 추가 및 활성화
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

    // 필수 필드 검증
    if (!server.key) {
      return alert("Key is required");
    }

    if (!server.command) {
      return alert("Command is required");
    }

    console.log("Saving server configuration:", server);

    // sessionStorage에 서버 목록 업데이트
    let serverList =
      JSON.parse(sessionStorage.getItem("mcp-server-list")) || [];

    // 기존 서버가 있으면 업데이트, 없으면 추가
    const existingIndex = serverList.findIndex((s) => s.key === server.key);
    if (existingIndex >= 0) {
      serverList[existingIndex] = server;
    } else {
      serverList.push(server);
    }

    sessionStorage.setItem("mcp-server-list", JSON.stringify(serverList));

    try {
      // 서버 설정 저장
      try {
        await window.mcpAPI.addServer(server);
      } catch (e) {
        if (/already exists/.test(e.message)) {
          await window.mcpAPI.updateServer(server);
        } else {
          throw e;
        }
      }

      // 서버 활성화
      await window.mcpAPI.activate(server);
      alert("Server saved and activated successfully.");

      // 활성화된 클라이언트 목록 업데이트
      let activeClients =
        JSON.parse(sessionStorage.getItem("active-clients")) || [];
      if (!activeClients.includes(server.key)) {
        activeClients.push(server.key);
        sessionStorage.setItem("active-clients", JSON.stringify(activeClients));
      }
    } catch (err) {
      console.error("Save/activate error:", err);
      alert("Failed to save or activate: " + err.message);
    }

    updateJsonPreview();
  });

  // 4. 삭제 버튼 → MCP 서버 삭제
  deleteBtn.addEventListener("click", async () => {
    const selectedKey = sessionStorage.getItem("selected-mcp-key");
    if (!selectedKey) return alert("No MCP selected to delete");

    console.log(`🗑️ Starting deletion process for server: ${selectedKey}`);

    try {
      // 🎯 백엔드에서 서버 제거
      const result = await window.mcpAPI.removeServer(selectedKey);
      console.log(`✅ Backend removal result: ${result}`);

      // 🎯 백엔드 성공 후 프론트엔드 정리
      console.log(`🧹 Cleaning up frontend storage for: ${selectedKey}`);

      // serverList에서 제거
      let serverList =
        JSON.parse(sessionStorage.getItem("mcp-server-list")) || [];
      const originalLength = serverList.length;
      serverList = serverList.filter((server) => server.key !== selectedKey);
      console.log(
        `📋 Removed from serverList: ${originalLength} → ${serverList.length}`
      );
      sessionStorage.setItem("mcp-server-list", JSON.stringify(serverList));

      // activeClients에서 제거
      let activeClients =
        JSON.parse(sessionStorage.getItem("active-clients")) || [];
      const originalActiveLength = activeClients.length;
      activeClients = activeClients.filter((key) => key !== selectedKey);
      console.log(
        `🔗 Removed from activeClients: ${originalActiveLength} → ${activeClients.length}`
      );
      sessionStorage.setItem("active-clients", JSON.stringify(activeClients));

      // 선택된 키 정리
      sessionStorage.removeItem("selected-mcp-key");
      console.log(`🔑 Cleared selected-mcp-key`);

      alert("Server deleted successfully!");

      // 3. 메인 페이지로 리다이렉트
      console.log(`🔄 Redirecting to main page...`);
      window.location.href = "index.html";
    } catch (err) {
      console.error("❌ Failed to delete server:", err);

      // 사용자에게 더 친화적인 메시지 표시 -> 해당 메세지로 인해 사용자 혼란 가중 -> 실제 기능 동작에는 문제 없음 확인
      // const userMessage = err.message.includes("not found")
      //   ? `Server "${selectedKey}" was already removed or doesn't exist.`
      //   : `Failed to delete server: ${err.message}`;

      // alert(userMessage);

      // "not found" 오류의 경우 프론트엔드만 정리하고 계속 진행
      if (err.message.includes("not found")) {
        console.log(
          `🔄 Cleaning up frontend only for non-existent server: ${selectedKey}`
        );

        let serverList =
          JSON.parse(sessionStorage.getItem("mcp-server-list")) || [];
        serverList = serverList.filter((server) => server.key !== selectedKey);
        sessionStorage.setItem("mcp-server-list", JSON.stringify(serverList));

        let activeClients =
          JSON.parse(sessionStorage.getItem("active-clients")) || [];
        activeClients = activeClients.filter((key) => key !== selectedKey);
        sessionStorage.setItem("active-clients", JSON.stringify(activeClients));

        sessionStorage.removeItem("selected-mcp-key");

        window.location.href = "index.html";
      }
    }
  });

  // 5. 뒤로가기 버튼 → index.html로 이동
  backBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // 6. 초기 상태에서도 preview 동기화
  updateJsonPreview();

  // 7. 선택된 MCP 값 불러오기 (비동기 방식으로 수정 필요!)
  (async () => {
    const selectedKey = sessionStorage.getItem("selected-mcp-key");
    if (selectedKey && window.mcpAPI?.getConfig) {
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
