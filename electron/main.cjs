const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

function log(msg) {
  try {
    const p = path.join(app.getPath("userData"), "app.log");
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

async function boot() {
  try {
    // DB ở userData (đảm bảo ghi được khi portable)
    process.env.DB_FILE = path.join(app.getPath("userData"), "data.sqlite");

    const appPath = app.getAppPath();        // ...\resources\app.asar
    const serverPath = path.join(appPath, "server.js");
    const serverUrl = pathToFileURL(serverPath).href;

    log(`appPath=${appPath}`);
    log(`serverPath=${serverPath}`);
    log(`DB_FILE=${process.env.DB_FILE}`);

    const mod = await import(serverUrl);
    if (!mod.startServer) throw new Error("startServer() not found in server.js");

    const { port } = await mod.startServer(0);
    log(`server started port=${port}`);

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      show: true,
      webPreferences: { contextIsolation: true }
    });

    win.on("closed", () => {
      app.quit();
    });

    await win.loadURL(`http://127.0.0.1:${port}/`);
  } catch (e) {
    const msg = e && e.stack ? e.stack : String(e);
    log(`FATAL: ${msg}`);
    dialog.showErrorBox("QR Factory V2 Online - Crash", msg);
    app.quit();
  }
}

app.whenReady().then(boot);

app.on("window-all-closed", () => {
  app.quit();
});
