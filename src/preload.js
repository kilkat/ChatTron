const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const settingsFilePath = path.join(os.homedir(), ".chattron", "settings.json");

contextBridge.exposeInMainWorld("settingsAPI", {
  load: () => {
    try {
      if (fs.existsSync(settingsFilePath)) {
        const data = fs.readFileSync(settingsFilePath, "utf-8");
        return JSON.parse(data);
      }
    } catch (err) {
      console.error("setting file failed:", err);
    }
    return null;
  },
  save: (settings) => {
    try {
      const dir = path.dirname(settingsFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error("setting save failed:", err);
    }
  },
});

contextBridge.exposeInMainWorld("mcpAPI", {
  addServer: (server) => ipcRenderer.invoke("mcp-add-server", server),
  updateServer: (server) => ipcRenderer.invoke("mcp-update-server", server),
  getConfig: () => ipcRenderer.invoke("mcp-get-config"),
  activate: (keyOrServer) => ipcRenderer.invoke("mcp-activate", keyOrServer),
  deactivate: (key) => ipcRenderer.invoke("mcp-deactivate", key),
  removeServer: (key) => ipcRenderer.invoke("remove-server", key),
  listTools: (key) => ipcRenderer.invoke("mcp-list-tools", key),
  callTool: ({ client, name, args }) =>
    ipcRenderer.invoke("mcp-call-tool", { client, name, args }),
  getClients: () => ipcRenderer.invoke("mcp-get-clients"),
});

// Prompt API 추가
contextBridge.exposeInMainWorld("promptAPI", {
  loadPrompt: async (promptPath) => {
    try {
      // __dirname은 preload.js 파일이 위치한 src 디렉토리를 가리킴
      const fullPath = path.join(__dirname, promptPath);
      console.log(`Attempting to load prompt from: ${fullPath}`);
      const data = await fs.promises.readFile(fullPath, "utf-8");
      return data;
    } catch (err) {
      console.error(`Failed to load prompt from ${promptPath}:`, err);
      return null;
    }
  },
});