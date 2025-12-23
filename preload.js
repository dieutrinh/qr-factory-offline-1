const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("qrFactory", {
  ok: true
});
