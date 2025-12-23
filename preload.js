// preload.js
"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("qrFactory", {
  toDataUrl: async (text, opts = {}) => {
    return await QRCode.toDataURL(String(text), {
      width: 320,
      margin: 1,
      ...opts
    });
  },

  openExternal: async (url) => {
    return await ipcRenderer.invoke("open-external", String(url));
  },

  savePng: async ({ filename, dataUrl }) => {
    return await ipcRenderer.invoke("save-png", { filename, dataUrl });
  },

  savePdf: async ({ filename }) => {
    return await ipcRenderer.invoke("save-pdf", { filename });
  }
});
