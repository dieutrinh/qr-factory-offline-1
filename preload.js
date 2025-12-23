// preload.js
"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("qrFactory", {
  // ✅ QR generator (offline)
  toDataUrl: async (text, opts = {}) => {
    return await QRCode.toDataURL(String(text), { width: 360, margin: 1, ...opts });
  },

  // ✅ call API qua main process (không bị CORS / không cần port cố định)
  apiGet: (path) => ipcRenderer.invoke("api-get", { path }),
  apiPost: (path, body) => ipcRenderer.invoke("api-post", { path, body }),

  // ✅ open link
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  // ✅ save files
  savePng: (args) => ipcRenderer.invoke("save-png", args),
  savePdf: (args) => ipcRenderer.invoke("save-pdf", args),
});
