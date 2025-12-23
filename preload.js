const { contextBridge } = require('electron');

let QRCode;
try {
  QRCode = require('qrcode');
} catch (e) {
  QRCode = null;
}

contextBridge.exposeInMainWorld('qrFactory', {
  toDataUrl: async (text, opts = {}) => {
    if (!QRCode) throw new Error("Missing dependency 'qrcode'. Check package.json dependencies.");
    return await QRCode.toDataURL(String(text), { width: 320, margin: 1, ...opts });
  }
});
