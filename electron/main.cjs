const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

function logToFile(msg) {
  try {
    const p = path.join(app.getPath("userData"), "app.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

async function createWindow() {
  try {
    // DB nằm trong userData để ghi được khi packaged
    process.env.DB_FILE = path.join(app.getPath("userData"), "data.sqlite");

    // Lấy path app đúng trong dev + packaged
    const appPath = app.getAppPath(); // ví dụ: ...\resources\app.asar
    const serverPath = path.join(appPath, "server.js");

    logToFile(`appPath=${appPath}`);
    logToFile(`serverPath=${serverPath}`);

    // ✅ IMPORT ĐÚNG: dùng file:// URL (tránh crash trên Windows)
    const serverUrl = pathToFileURL(serverPath).href;
    const mod = await import(serverUrl);

    if (!mod.startServer) throw new Error("startServer() not found in server.js");

    // chạy server trên port random
    const { port } = await mod.startServer(0);
    logToFile(`server started on port=${port}`);

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      webPreferences: { contextIsolation: true }
    });

    await win.loadURL(`http://127.0.0.1:${port}/`);
  } catch (err) {
    const msg = err && err.stack ? err.stack : String(err);
    logToFile(`FATAL: ${msg}`);
    dialog.showErrorBox("QR Factory V2 Online - Crash", msg);
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
