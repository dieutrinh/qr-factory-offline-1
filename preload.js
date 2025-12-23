const { contextBridge, ipcRenderer } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("qrFactory", {
  // tạo QR dataURL
  toDataUrl: async (text, opts = {}) => {
    return await QRCode.toDataURL(String(text), { width: 320, margin: 1, ...opts });
  },

  // mở link bằng default browser
  openExternal: async (url) => {
    return await ipcRenderer.invoke("open-external", String(url));
  },

  // lưu PNG từ dataURL (data:image/png;base64,...)
  savePng: async ({ filename, dataUrl }) => {
    return await ipcRenderer.invoke("save-png", { filename, dataUrl });
  },

  // lưu PDF từ base64 (data:application/pdf;base64,...)
  savePdf: async ({ filename, dataUrl }) => {
    return await ipcRenderer.invoke("save-pdf", { filename, dataUrl });
  },

  // (tuỳ bạn) call server nội bộ (nếu cần)
  apiPost: async (path, body) => {
    return await ipcRenderer.invoke("api-post", { path, body });
  },
});
