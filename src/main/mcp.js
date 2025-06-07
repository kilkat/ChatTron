const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StdioClientTransport,
} = require("@modelcontextprotocol/sdk/client/stdio.js");

// Define a list of environment variables to pass to MCP tools based on OS
const DEFAULT_ENV_VARS =
  process.platform === "win32"
    ? [
        "APPDATA",
        "HOMEDRIVE",
        "HOMEPATH",
        "LOCALAPPDATA",
        "PATH",
        "PROCESSOR_ARCHITECTURE",
        "SYSTEMDRIVE",
        "SYSTEMROOT",
        "TEMP",
        "USERNAME",
        "USERPROFILE",
      ]
    : ["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER"];

// Extract a minimal, clean environment to be passed to spawned processes
function getDefaultEnvironment() {
  const env = {};
  DEFAULT_ENV_VARS.forEach((key) => {
    const value = process.env[key];
    // Exclude invalid or shell function-style values (e.g., Bash functions)
    if (value !== undefined && !value.startsWith("()")) {
      env[key] = value;
    }
  });
  return env;
}

// MCPManager manages configuration and runtime interaction with MCP clients
class MCPManager {
  constructor() {
    // Track active clients by key
    this.clients = {};

    // Define path to persistent configuration file
    this.configPath = path.join(app.getPath("userData"), "mcp.json");
  }

  // Load config from disk; create default config if missing
  getConfig() {
    if (!fs.existsSync(this.configPath)) {
      fs.writeFileSync(
        this.configPath,
        JSON.stringify({ mcpServers: {} }, null, 2)
      );
    }
    const raw = fs.readFileSync(this.configPath, "utf-8");
    return JSON.parse(raw);
  }

  // Save updated config to disk
  saveConfig(config) {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  // Initialize MCPManager (reserved for future startup logic)
  async init() {
    // Placeholder for initialization logic
  }

  // Load and activate all servers marked as isActive in config
  async load() {
    const config = this.getConfig();
    for (const [key, server] of Object.entries(config.mcpServers)) {
      if (server.isActive) {
        await this.activate(server);
      }
    }
  }

  // Activate and connect to an MCP tool server
  async activate(server) {
    // Create a new MCP client instance with a unique name and version
    const client = new Client({ name: server.key, version: "1.0.0" });

    // Create a Stdio transport that runs the specified command and arguments
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: {
        ...getDefaultEnvironment(), // Clean environment
        PATH: process.env.PATH || "",
      },
      stderr: process.platform === "win32" ? "pipe" : "inherit", // Pipe stderr only on Windows
    });

    // Establish connection between client and tool server
    await client.connect(transport);

    // Track the connected client instance
    this.clients[server.key] = client;

    // Mark this server as active in the config
    const config = this.getConfig();
    config.mcpServers[server.key] = { ...server, isActive: true };
    this.saveConfig(config);
  }

  // Gracefully close and deactivate a specific server
  async deactivate(key) {
    if (this.clients[key]) {
      await this.clients[key].close(); // Disconnect client
      delete this.clients[key]; // Remove from memory
    }

    const config = this.getConfig();
    if (config.mcpServers[key]) {
      config.mcpServers[key].isActive = false;
      this.saveConfig(config); // Persist deactivation
    }
  }

  // Call a specific tool by name and arguments on a given client
  async callTool({ client, name, args }) {
    const c = this.clients[client];
    if (!c) throw new Error(`Client ${client} not found`);
    return await c.callTool({ name, arguments: args });
  }

  // Retrieve list of available tools from a given client
  async listTools(client) {
    const c = this.clients[client];
    if (!c) throw new Error(`Client ${client} not found`);
    return await c.listTools();
  }

  // Return all currently active client keys
  getClientNames() {
    return Object.keys(this.clients);
  }

  // Add a new MCP server entry to the configuration
  addServer(server) {
    const config = this.getConfig();
    if (config.mcpServers[server.key]) return false; // Prevent duplicates
    config.mcpServers[server.key] = server;
    this.saveConfig(config);
    return true;
  }

  // Update an existing MCP server entry in the configuration
  updateServer(server) {
    const config = this.getConfig();
    if (!config.mcpServers[server.key]) return false; // Cannot update non-existent server
    config.mcpServers[server.key] = server;
    this.saveConfig(config);
    return true;
  }
}

// Export singleton instance of MCPManager
module.exports = {
  mcp: new MCPManager(),
};
