const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const configFilePath = path.join(os.homedir(), ".chattron", "settings.json");

contextBridge.exposeInMainWorld("settingsAPI", {
  load: () => {
    try {
      if (fs.existsSync(configFilePath)) {
        const data = fs.readFileSync(configFilePath, "utf-8");
        return JSON.parse(data);
      }
    } catch (err) {
      console.error("setting file load failed:", err);
    }
    return null;
  },
  save: (settings) => {
    try {
      const dir = path.dirname(configFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(configFilePath, JSON.stringify(settings, null, 2));
    } catch (err) {
      console.error("setting save failed:", err);
    }
  },
});
