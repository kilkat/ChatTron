const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
// const fs = require("fs").promises; // fs.promises import 제거
const { mcp } = require("./mcp");

let mcpToolRegistry = {};

function createWindow(htmlFile = "index.html") {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "../preload.js"),
      sandbox: false,
    },
  });

  const htmlPath = path.join(__dirname, `../../public/${htmlFile}`);
  console.log("Loading HTML from:", htmlPath);
  win.loadFile(htmlPath);
}

app.whenReady().then(async () => {
  await mcp.init();
  await mcp.load();
  createWindow();
});

// IPC for MCP management
// ipcMain.handle("mcp-add-server", (_, server) => mcp.addServer(server));
ipcMain.handle("mcp-add-server", (_, server) => {
  const { key } = server;
  const cfg = mcp.getConfig().mcpServers || {};

  if (cfg[key]) {
    // 중복 키인 경우 업데이트
    mcp.updateServer(server);
    return "Server updated";
  } else {
    // 신규 서버 추가
    mcp.addServer(server);
    return "Server added";
  }
});
ipcMain.handle("mcp-update-server", (_, server) => {
  if (!mcp.updateServer(server)) {
    throw new Error(`Server ${server.key} does not exist`);
  }
  return "Server updated";
});
ipcMain.handle("mcp-get-config", () => mcp.getConfig());
ipcMain.handle("mcp-activate", async (_, serverOrKey) => {
  console.log("Received activation request:", serverOrKey);

  try {
    let serverToActivate;

    if (typeof serverOrKey === "string") {
      // key로 전달된 경우
      const key = serverOrKey;
      const cfg = mcp.getConfig().mcpServers || {};

      if (!cfg[key]) {
        throw new Error(`Server ${key} not found in configuration`);
      }

      serverToActivate = cfg[key];
    } else {
      // server 객체가 넘어온 경우
      const server = serverOrKey;
      const key = server.key;

      if (!key) {
        throw new Error("Server object must have a 'key' field");
      }

      const cfg = mcp.getConfig().mcpServers || {};

      // 설정에 서버 추가/업데이트
      if (cfg[key]) {
        mcp.updateServer(server);
      } else {
        mcp.addServer(server);
      }

      serverToActivate = server;
    }

    // 필수 필드 검증
    if (!serverToActivate.command) {
      throw new Error(
        `Server ${serverToActivate.key} is missing required 'command' field`
      );
    }

    console.log("Attempting to activate server:", {
      key: serverToActivate.key,
      command: serverToActivate.command,
      args: serverToActivate.args,
    });

    const result = await mcp.activate(serverToActivate);
    return result;
  } catch (err) {
    console.error(`Failed to activate MCP server:`, err);
    throw err;
  }
});
ipcMain.handle("mcp-deactivate", (_, key) => mcp.deactivate(key));
ipcMain.handle("remove-server", async (event, key) => {
  console.log(`Attempting to remove server with key: ${key}`);

  try {
    // 1. 먼저 비활성화
    try {
      await mcp.deactivate(key);
      console.log(`✅ Deactivated server: ${key}`);
    } catch (err) {
      console.warn(`⚠️ Failed to deactivate ${key}:`, err.message);
      // 비활성화 실패해도 계속 진행
    }

    // 2. 설정에서 서버 제거
    const config = mcp.getConfig();
    if (config.mcpServers && config.mcpServers[key]) {
      delete config.mcpServers[key];
      mcp.saveConfig(config);
      console.log(`✅ Removed server ${key} from config`);
    } else {
      console.warn(`⚠️ Server ${key} not found in config`);
    }

    // 3. 메모리에서 클라이언트 제거 (이미 deactivate에서 처리되지만 확실히)
    if (mcp.clients[key]) {
      delete mcp.clients[key];
      console.log(`✅ Removed client ${key} from memory`);
    }

    console.log(`✅ Successfully removed server: ${key}`);
    return "Server deleted successfully";
  } catch (error) {
    console.error(`❌ Failed to remove server ${key}:`, error);
    throw new Error(`Failed to remove server ${key}: ${error.message}`);
  }
});
ipcMain.handle("mcp-list-tools", (_, key) => mcp.listTools(key));
ipcMain.handle("mcp-call-tool", (_, { client, name, args }) =>
  mcp.callTool({ client, name, args })
);
ipcMain.handle("mcp-get-clients", () => mcp.getClientNames());

// Optional: open MCP Settings UI manually
ipcMain.on("open-mcp", () => {
  console.log("[MAIN] Received open-mcp IPC");
  createWindow("mcp.html");
});