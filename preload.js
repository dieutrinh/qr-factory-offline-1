const { contextBridge, ipcRenderer } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("qrFactory", {
  // tạo QR dataURL
  toDataUrl: async (text, opts = {}) => {
    return await QRCode.toDataURL(String(text), {
      width: 320,
      margin: 1,
      ...opts,
    });
  },

  // mở link default browser
  openExternal: async (url) => {
    return await ipcRenderer.invoke("open-external", String(url));
  },

  // lưu PNG
  savePng: async ({ filename, dataUrl }) => {
    return await ipcRenderer.invoke("save-png", { filename, dataUrl });
  },

  // lưu PDF (dùng printToPDF của Electron)
  savePdf: async ({ filename }) => {
    return await ipcRenderer.invoke("save-pdf", { filename });
  },
});
