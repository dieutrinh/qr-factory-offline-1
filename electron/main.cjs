// electron/main.cjs
"use strict";

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

let mainWindow = null;
let serverProc = null;

function safeWriteLog(name, msg) {
  try {
    fs.writeFileSync(path.join(process.cwd(), name), String(msg), "utf8");
  } catch {}
}

// Log crash ra file (để không “im lặng”)
process.on("uncaughtException", (err) => safeWriteLog("main-crash.log", err?.stack || err));
process.on("unhandledRejection", (err) => safeWriteLog("main-crash.log", err?.stack || err));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // ✅ Luôn load đúng www/index.html
  mainWindow.loadFile(path.join(__dirname, "..", "www", "index.html"));

  // Bật khi cần debug
  // mainWindow.webContents.openDevTools({ mode: "detach" });
}

function maybeStartServer() {
  // Nếu bạn có server.js thì tự chạy, còn không có thì bỏ qua để khỏi crash
  const serverPath = path.join(__dirname, "..", "server.js");
  if (!fs.existsSync(serverPath)) return;

  try {
    serverProc = spawn(process.execPath, [serverPath], { stdio: "inherit" });
    serverProc.on("error", (e) => safeWriteLog("server-crash.log", e?.stack || e));
  } catch (e) {
    safeWriteLog("server-crash.log", e?.stack || e);
  }
}

app.whenReady().then(() => {
  maybeStartServer();
  createWindow();

  a
