"use strict";

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");

let win = null;
let serverProc = null;

const API_HOST = "127.0.0.1";
const API_PORT = 3000;

/* ===================== 1) SINGLE INSTANCE LOCK ===================== */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Nếu user bấm link/QR mà OS gọi exe lần nữa -> focus cửa sổ cũ
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

/* ===================== helpers ===================== */
function startServer() {
  const serverPath = path.join(__dirname, "..", "server.js");
  if (!fs.existsSync(serverPath)) return;

  serverProc = spawn(process.execPath, [serverPath], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(API_PORT) }
  });
}

function httpRequest({ method, path: apiPath, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        hostname: API_HOST,
        port: API_PORT,
        path: apiPath,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`API ${res.statusCode}: ${data}`));
          }
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* ===================== create window ===================== */
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // ✅ Load UI chính
  win.loadFile(path.join(__dirname, "..", "www", "index.html"));

  // ✅ 2) CHẶN “MỞ TAB/WINDOW” TRONG ELECTRON
  // Mọi window.open / target=_blank -> mở bằng browser thay vì tạo tab exe
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // ✅ Chặn navigate ra ngoài (http/https) trong app -> mở browser
  win.webContents.on("will-navigate", (e, url) => {
    const isLocal =
      url.startsWith("file://") ||
      url.startsWith(`http://${API_HOST}:${API_PORT}`) ||
      url.startsWith(`http://localhost:${API_PORT}`);

    if (!isLocal) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Khi đóng app -> kill server
  win.on("close", () => {
    try { if (serverProc) serverProc.kill(); } catch {}
  });
}

/* ===================== app lifecycle ===================== */
app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on("window-all-closed", () => {
  try { if (serverProc) serverProc.kill(); } catch {}
  if (process.platform !== "darwin") app.quit();
});

/* ===================== IPC ===================== */
ipcMain.handle("open-external", async (_e, url) => {
  if (!url) return { ok: false, error: "Empty URL" };
  await shell.openExternal(String(url));
  return { ok: true };
});

ipcMain.handle("save-png", async (_e, { filename = "qr.png", dataUrl }) => {
  if (!dataUrl || !String(dataUrl).startsWith("data:image")) {
    return { ok: false, error: "PNG dataUrl invalid" };
  }
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save PNG",
    defaultPath: filename,
    filters: [{ name: "PNG", extensions: ["png"] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const base64 = String(dataUrl).split(",")[1] || "";
  await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"));
  return { ok: true, filePath };
});

ipcMain.handle("save-pdf", async (event, { filename = "qr.pdf" }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save PDF",
    defaultPath: filename,
    filters: [{ name: "PDF", extensions: ["pdf"] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  const pdf = await event.sender.printToPDF({ printBackground: true, pageSize: "A4" });
  await fs.promises.writeFile(filePath, pdf);
  return { ok: true, filePath };
});

ipcMain.handle("api-get", async (_e, { path: apiPath }) => {
  return await httpRequest({ method: "GET", path: apiPath });
});
ipcMain.handle("api-post", async (_e, { path: apiPath, body }) => {
  return await httpRequest({ method: "POST", path: apiPath, body });
});
