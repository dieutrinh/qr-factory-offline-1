const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

// ... phần createWindow của bạn giữ nguyên ...

ipcMain.handle("open-external", async (_e, url) => {
  if (!url) return;
  await shell.openExternal(url);
});

ipcMain.handle("save-png", async (_e, { filename = "qr.png", dataUrl }) => {
  if (!dataUrl || !String(dataUrl).startsWith("data:image")) throw new Error("PNG dataUrl invalid");
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save PNG",
    defaultPath: filename,
    filters: [{ name: "PNG Image", extensions: ["png"] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const base64 = String(dataUrl).split(",")[1];
  await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"));
  return { canceled: false, filePath };
});

ipcMain.handle("save-pdf", async (_e, { filename = "qr.pdf", dataUrl }) => {
  if (!dataUrl || !String(dataUrl).startsWith("data:application/pdf")) throw new Error("PDF dataUrl invalid");
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save PDF",
    defaultPath: filename,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const base64 = String(dataUrl).split(",")[1];
  await fs.promises.writeFile(filePath, Buffer.from(base64, "base64"));
  return { canceled: false, filePath };
});

// Nếu bạn có server.js chạy localhost và muốn renderer gọi qua main để tránh CORS:
ipcMain.handle("api-post", async (_e, { path: apiPath, body }) => {
  const http = require("http");
  const payload = JSON.stringify(body ?? {});
  const opts = {
    hostname: "127.0.0.1",
    port: 3000,              // đổi theo server của bạn
    path: apiPath,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
  };

  return await new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`API ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
});
