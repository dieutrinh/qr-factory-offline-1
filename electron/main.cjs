"use strict";

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

let mainWin = null;
let serverProc = null;
let baseUrl = ""; // http://127.0.0.1:xxxxx

function findIndexHtml() {
  // ✅ chịu được lộn thư mục www/www
  const candidates = [
    path.join(app.getAppPath(), "www", "index.html"),
    path.join(app.getAppPath(), "www", "www", "index.html"),
    path.join(__dirname, "..", "www", "index.html"),
    path.join(__dirname, "..", "www", "www", "index.html"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverJs = path.join(app.getAppPath(), "server.js");
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: "0", // ✅ port động
      APP_DB_DIR: app.getPath("userData"), // ✅ DB ổn định theo máy user
    };

    serverProc = spawn(process.execPath, [serverJs], { env, stdio: ["ignore", "pipe", "pipe"] });

    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("Server start timeout"));
    }, 10000);

    const onData = (buf) => {
      const s = String(buf);
      // console.log(s);
      const m = s.match(/__PORT__=(\d+)/);
      if (m && !done) {
        const port = Number(m[1]);
        baseUrl = `http://127.0.0.1:${port}`;
        clearTimeout(timeout);
        done = true;
        resolve();
      }
    };

    serverProc.stdout.on("data", onData);
    serverProc.stderr.on("data", onData);

    serverProc.on("exit", (code) => {
      if (done) return;
      clearTimeout(timeout);
      done = true;
      reject(new Error("Server crashed, code=" + code));
    });
  });
}

async function createWindow() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 760,
    webPreferences: {
      preload: path.join(app.getAppPath(), "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ✅ nếu load fail thì show lỗi (không trắng)
  mainWin.webContents.on("did-fail-load", (_e, code, desc) => {
    mainWin.loadURL(
      "data:text/plain;charset=utf-8," +
        encodeURIComponent(`Failed to load UI. (${code}) ${desc}`)
    );
  });

  await mainWin.loadFile(findIndexHtml());
}

app.whenReady().then(async () => {
  try {
    await startServer();   // ✅ tự start server, port động
    await createWindow();  // ✅ rồi mới mở UI
  } catch (e) {
    const w = new BrowserWindow({ width: 900, height: 520 });
    w.loadURL("data:text/plain;charset=utf-8," + encodeURIComponent(String(e.stack || e)));
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try { serverProc?.kill(); } catch {}
});

// ===== IPC: API proxy (renderer không cần biết port) =====
async function callApi(method, p, body) {
  if (!baseUrl) throw new Error("Server not ready");
  const url = baseUrl + p;
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`API ${r.status}: ${text}`);
  try { return JSON.parse(text); } catch { return { ok: true, text }; }
}

ipcMain.handle("api-get", async (_e, { path: p }) => callApi("GET", p));
ipcMain.handle("api-post", async (_e, { path: p, body }) => callApi("POST", p, body));

ipcMain.handle("open-external", async (_e, url) => {
  if (!url) return;
  // nếu là link tương đối -> convert sang BASE_URL
  if (typeof url === "string" && url.startsWith("/")) url = baseUrl + url;
  await shell.openExternal(url);
});

function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:(.+);base64,(.*)$/);
  if (!m) throw new Error("Invalid dataUrl");
  return Buffer.from(m[2], "base64");
}

ipcMain.handle("save-png", async (_e, { filename = "qr.png", dataUrl }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: "PNG", extensions: ["png"] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  fs.writeFileSync(filePath, dataUrlToBuffer(dataUrl));
  return { ok: true, filePath };
});

ipcMain.handle("save-pdf", async (_e, { filename = "qr.pdf" } = {}) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: filename,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const pdf = await mainWin.webContents.printToPDF({ printBackground: true });
  fs.writeFileSync(filePath, pdf);
  return { ok: true, filePath };
});
