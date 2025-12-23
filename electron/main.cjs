"use strict";

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const http = require("http");
const net = require("net");

let win = null;
let serverProc = null;

const API_HOST = "127.0.0.1";
let API_PORT = null;

/* ===== Single instance ===== */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

/* ===== Free port ===== */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, API_HOST, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/* ===== Ping /api/health ===== */
function pingHealth(host, port, timeoutMs = 25000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.request(
        { hostname: host, port, path: "/api/health", method: "GET", timeout: 2500 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) return resolve(true);
          if (Date.now() - started > timeoutMs) return resolve(false);
          setTimeout(tick, 300);
        }
      );
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(tick, 300);
      });
      req.end();
    };
    tick();
  });
}

/* ===== Start server (IMPORTANT: ELECTRON_RUN_AS_NODE) ===== */
function startServer() {
  const serverPath = path.join(__dirname, "..", "server.js");
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Không thấy server.js tại: ${serverPath}`);
  }

  serverProc = spawn(process.execPath, [serverPath], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(API_PORT),

      // ✅ THIS FIXES PACKAGED EXE:
      // chạy app.exe như Node để execute server.js
      ELECTRON_RUN_AS_NODE: "1"
    }
  });

  serverProc.on("exit", (code) => {
    try { win?.webContents?.send("server-exit", { code }); } catch {}
  });
}

/* ===== Proxy requests ===== */
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

/* ===== Window ===== */
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

  win.loadFile(path.join(__dirname, "..", "www", "index.html"));

  // chặn mở “tab/window” trong app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("close", () => {
    try { if (serverProc) serverProc.kill(); } catch {}
  });
}

/* ===== Lifecycle ===== */
app.whenReady().then(async () => {
  try {
    API_PORT = await getFreePort();
    startServer();

    const ok = await pingHealth(API_HOST, API_PORT, 25000);
    if (!ok) {
      await dialog.showMessageBox({
        type: "error",
        title: "Server không chạy",
        message:
          "Không khởi động được server nội bộ.\n\n" +
          "Nguyên nhân thường gặp: lỗi better-sqlite3, thiếu module, hoặc server.js crash.\n\n" +
          "Nếu cần debug: mở CMD tại thư mục project và chạy: npm run server"
      });
      app.quit();
      return;
    }

    createWindow();
    win.webContents.on("did-finish-load", () => {
      win.webContents.send("server-ready", { ok: true, host: API_HOST, port: API_PORT });
    });
  } catch (e) {
    await dialog.showMessageBox({
      type: "error",
      title: "Lỗi khởi động",
      message: String(e?.message || e)
    });
    app.quit();
  }
});

app.on("window-all-closed", () => {
  try { if (serverProc) serverProc.kill(); } catch {}
  if (process.platform !== "darwin") app.quit();
});

/* ===== IPC ===== */
ipcMain.handle("open-external", async (_e, url) => {
  if (!url) return { ok: false, error: "Empty URL" };
  await shell.openExternal(String(url));
  return { ok: true };
});

// ✅ Backward compatible: accept (string) or ({path})
ipcMain.handle("api-get", async (_e, arg) => {
  const apiPath = typeof arg === "string" ? arg : (arg?.path || "");
  return await httpRequest({ method: "GET", path: apiPath });
});

// ✅ Backward compatible: accept ({path,body}) or (path, body)
ipcMain.handle("api-post", async (_e, arg) => {
  if (typeof arg === "string") return await httpRequest({ method: "POST", path: arg, body: {} });
  return await httpRequest({ method: "POST", path: arg?.path || "", body: arg?.body || {} });
});

ipcMain.handle("save-png", async (_e, { filename = "qr.png", dataUrl }) => {
  if (!dataUrl || !String(dataUrl).startsWith("data:image")) return { ok: false, error: "PNG dataUrl invalid" };
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
