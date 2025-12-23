const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const { startServer } = require("./server.js");

let win;
let serverRef;

async function createWindow(baseUrl) {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // preload chỉ cần khi bạn dùng IPC. Ở bản này không bắt buộc.
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  await win.loadURL(baseUrl);
}

app.whenReady().then(async () => {
  try {
    serverRef = await startServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${serverRef.port}/index.html`;
    await createWindow(baseUrl);
  } catch (e) {
    dialog.showErrorBox(
      "Server không chạy",
      "Không khởi động được server nội bộ.\n\nChi tiết:\n" + String(e && e.stack ? e.stack : e)
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  try {
    if (serverRef && serverRef.server) serverRef.server.close();
  } catch {}
});
