const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
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
  console.log("Adding server:", server);
  mcpToolRegistry[server.key] = server;
  console.log("Current mcpToolRegistry:", mcpToolRegistry);
  return "Server added";
});
ipcMain.handle("mcp-get-config", () => mcp.getConfig());
ipcMain.handle("mcp-activate", (_, key) => {
  const cfg = mcp.getConfig();
  const server = cfg.mcpServers[key];
  if (server) return mcp.activate(server);
  return Promise.reject("Server not found");
});
ipcMain.handle("mcp-deactivate", (_, key) => mcp.deactivate(key));
ipcMain.handle("remove-server", async (event, key) => {
  console.log(`Attempting to remove server with key: ${key}`);
  if (mcpToolRegistry[key]) {
    delete mcpToolRegistry[key];
    console.log(`Server ${key} removed from mcpToolRegistry`);
    return "Server deleted";
  } else {
    console.warn(`Server with key ${key} not found.`);
    throw new Error(`Server with key ${key} not found.`);
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
