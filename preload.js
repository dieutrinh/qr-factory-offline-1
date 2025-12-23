// preload.js
"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("qrFactory", {
  toDataUrl: async (text, opts = {}) => {
    return await QRCode.toDataURL(String(text), { width: 320, margin: 1, ...opts });
  },

  openExternal: async (url) => ipcRenderer.invoke("open-external", String(url)),
  savePng: async ({ filename, dataUrl }) => ipcRenderer.invoke("save-png", { filename, dataUrl }),
  savePdf: async ({ filename }) => ipcRenderer.invoke("save-pdf", { filename }),

  apiGet: async (path) => ipcRenderer.invoke("api-get", { path }),
  apiPost: async (path, body) => ipcRenderer.invoke("api-post", { path, body })
});
