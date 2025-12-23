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

/* ===== Single instance: không mở nhiều exe ===== */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

/* ===== Get free port (port động) ===== */
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

/* ===== HTTP ping /api/health để đảm bảo server lên ===== */
function pingHealth(host, port, timeoutMs = 20000) {
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
      req.on("timeout", () => {
        req.destroy();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(tick, 300);
      });
      req.end();
    };
    tick();
  });
}

/* ===== HTTP request helper (main proxy) ===== */
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
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* ===== Start server.js (tự start, port động) ===== */
function startServer() {
  const serverPath = path.join(__dirname, "..", "server.js");
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Không thấy server.js tại: ${serverPath}`);
  }

  serverProc = spawn(process.execPath, [serverPath], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(API_PORT) }
  });

  serverProc.on("exit", (code) => {
    // nếu server chết, báo UI (và tránh user bấm nút rồi ECONNREFUSED)
    try {
      win?.webContents?.send("server-exit", { code });
    } catch {}
  });
}

/* ===== Create window + chặn mở tab/window ===== */
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

  // chặn target=_blank / window.open tạo tab trong Electron
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
          "Bạn mở CMD tại thư mục project và chạy: npm run server để xem log lỗi."
      });
      app.quit();
      return;
    }

    createWindow();
    // báo UI: server ready + port thực tế
    win.webContents.on("did-finish-load", () => {
      win.webContents.send("server-ready", {
        ok: true,
        host: API_HOST,
        port: API_PORT
      });
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

// Proxy API: renderer gọi qua IPC => main tự dùng port động
ipcMain.handle("api-get", async (_e, { path: apiPath }) => {
  return await httpRequest({ method: "GET", path: apiPath });
});
ipcMain.handle("api-post", async (_e, { path: apiPath, body }) => {
  return await httpRequest({ method: "POST", path: apiPath, body });
});
