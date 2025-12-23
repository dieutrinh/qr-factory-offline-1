const { contextBridge } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("qrFactory", {
  toDataUrl: async (text, opts = {}) => {
    return await QRCode.toDataURL(String(text), { width: 320, margin: 1, ...opts });
  }
});
