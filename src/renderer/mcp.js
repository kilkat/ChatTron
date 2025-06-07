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
    const key = keyInput.value.trim();
    if (!key) return alert("Key is required");

    const server = {
      key,
      name: nameInput.value.trim(),
      description: descInput.value.trim(),
      command: cmdInput.value.trim(),
      args: argsInput.value
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
    };

    // 1. 기존 서버 목록을 sessionStorage에서 가져오기
    let serverList = JSON.parse(sessionStorage.getItem("mcpServers")) || [];

    // 2. 새로운 서버를 목록에 추가
    serverList.push(server);

    // 3. 업데이트된 서버 목록을 sessionStorage에 저장
    sessionStorage.setItem("mcp-server-list", JSON.stringify(serverList));

    try {
      const result = await window.mcpAPI.addServer(server);
      await window.mcpAPI.activate(key);
      alert("Server saved and activated.");
    } catch (err) {
      alert("Failed to save or activate: " + err.message);
      console.error(err);
    }

    updateJsonPreview();
  });

  // 4. 삭제 버튼 → MCP 서버 삭제
  deleteBtn.addEventListener("click", async () => {
    const selectedKey = sessionStorage.getItem("selected-mcp-key");
    if (!selectedKey) return alert("No MCP selected to delete");

    console.log(`Attempting to remove server with key: ${selectedKey}`);

    let serverList =
      JSON.parse(sessionStorage.getItem("mcp-server-list")) || [];

    serverList = serverList.filter((server) => server.key !== selectedKey);

    sessionStorage.setItem("mcp-server-list", JSON.stringify(serverList));

    sessionStorage.removeItem("selected-mcp-key");

    try {
      await window.mcpAPI.removeServer(selectedKey);
      alert("Server deleted.");

      // 서버 항목을 UI에서 제거
      const serverItem = document.querySelector(
        `[data-server-key="${selectedKey}"]`
      );
      if (serverItem) {
        serverItem.remove();
      }

      // 서버 목록 업데이트
      window.location.reload();
    } catch (err) {
      alert("Failed to delete server: " + err.message);
      console.error(err);
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
