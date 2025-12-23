"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("qrFactory", {
  toDataUrl: async (text, opts = {}) =>
    QRCode.toDataURL(String(text), { width: 360, margin: 1, ...opts }),

  apiGet: (path) => ipcRenderer.invoke("api-get", { path }),
  apiPost: (path, body) => ipcRenderer.invoke("api-post", { path, body }),

  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  savePng: (args) => ipcRenderer.invoke("save-png", args),
  savePdf: (args) => ipcRenderer.invoke("save-pdf", args),
});
