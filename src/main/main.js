const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "../preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "../../public/index.html"));
}

app.whenReady().then(createWindow);
