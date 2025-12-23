// preload.js
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("qrFactory", {
  apiGet: (path) => ipcRenderer.invoke("api-get", { path }),
  apiPost: (path, body) => ipcRenderer.invoke("api-post", { path, body }),

  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  savePng: (args) => ipcRenderer.invoke("save-png", args),
  savePdf: (args) => ipcRenderer.invoke("save-pdf", args),
});
