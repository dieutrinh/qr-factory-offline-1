const { contextBridge } = require("electron");
const QRCode = require("qrcode");

contextBridge.exposeInMainWorld("qr", {
  generateDataURL: async (text, opts = {}) => {
    const width = Number(opts.width || 512);
    const margin = Number(opts.margin ?? 2);
    return await QRCode.toDataURL(String(text), {
      errorCorrectionLevel: "M",
      width,
      margin,
      type: "image/png",
    });
  },
});
