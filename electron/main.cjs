process.on("uncaughtException", (err) => {
  const fs = require("fs");
  try {
    fs.writeFileSync("main-crash.log", String(err && (err.stack || err)), "utf8");
  } catch {}
});
process.on("unhandledRejection", (err) => {
  const fs = require("fs");
  try {
    fs.writeFileSync("main-crash.log", String(err && (err.stack || err)), "utf8");
  } catch {}
});
const { spawn } = require("child_process");
let serverProc = null;
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // ✅ CHỈ LOAD www/index.html (đừng load public/** nữa)
  mainWindow.loadFile(path.join(__dirname, "..", "www", "index.html"));

  // Mở devtools nếu cần
  // mainWindow.webContents.openDevTools({ mode: "detach" });
}

app.whenReady().then(() => {
 // auto start server
const serverPath = path.join(__dirname, "..", "server.js");
serverProc = spawn(process.execPath, [serverPath], { stdio: "inherit" });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
  if (serverProc) serverProc.kill();
});

// ===== IPC: open link =====
ipcMain.handle("open-external", async (_e, url) => {
  if (!url) return { ok: false, error: "Empty URL" };
  await shell.openExternal(String(url));
  return { ok: true };
});

// ===== IPC: save PNG (data:image/png;base64,...) =====
ipcMain.handle("save-png", async (_e, { filename = "qr.png", dataUrl }) => {
  if (!dataUrl || !String(dataUrl).startsWith("data:image")) {
    return { ok: false, error: "PNG dataUrl invalid" };
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save PNG",
    defaultPath: filename,
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });

  if (canceled || !filePath) return { ok: false, canceled: true };

  const base64 = String(dataUrl).split(",")[1];
  await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"));
  return { ok: true, filePath };
});

// ===== IPC: save PDF bằng printToPDF của chính cửa sổ hiện tại =====
ipcMain.handle("save-pdf", async (event, { filename = "qr.pdf" }) => {
  const wc = event.sender; // webContents của renderer

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save PDF",
    defaultPath: filename,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (canceled || !filePath) return { ok: false, canceled: true };

  const pdfBuffer = await wc.printToPDF({
    printBackground:
