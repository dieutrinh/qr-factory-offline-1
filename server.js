import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts } from "pdf-lib";
import XLSX from "xlsx";

// ✅ FIX: repo bạn đang là src/src/db.js
import {
  initDb,
  upsertMany,
  upsertOne,
  getByCode,
  listAll,
  exportToXlsxBuffer,
  getStats,
} from "./src/src/db.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  initDb();

  const app = express();
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

  app.use(express.json({ limit: "2mb" }));

  // ✅ FIX: repo bạn đang có public/public/*
  const PUBLIC_DIR = path.join(__dirname, "public", "public");
  app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

  function requireAdmin(req, res, next) {
    if (!ADMIN_TOKEN) return next();
    const token = req.headers["x-admin-token"] || req.query.token;
    if (token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: "Unauthorized" });
    next();
  }

  function normalizeRow(row) {
    const code = String(row.code || "").trim();
    if (!code) return null;

    const productName = String(row.productName ?? "").trim();
    const batch = String(row.batch ?? "").trim();
    const mfgDate = String(row.mfgDate ?? "").trim();
    const expDate = String(row.expDate ?? "").trim();
    const note = String(row.note ?? "").trim();
    const statusRaw = String(row.status ?? "active").trim().toLowerCase();
    const status = ["active", "inactive", "revoked"].includes(statusRaw) ? statusRaw : "active";

    return { code, productName, batch, mfgDate, expDate, note, status };
  }

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, stats: getStats() });
  });

  app.post("/api/admin/create", requireAdmin, (req, res) => {
    const body = req.body || {};
    const code = (body.code && String(body.code).trim()) || nanoid(10);

    const row = normalizeRow({
      code,
      productName: body.productName,
      batch: body.batch,
      mfgDate: body.mfgDate,
      expDate: body.expDate,
      note: body.note,
      status: body.status ?? "active",
    });
    if (!row) return res.status(400).json({ ok: false, error: "Missing code" });

    upsertOne(row);
    res.json({ ok: true, code: row.code, url: `/q/${encodeURIComponent(row.code)}` });
  });

  app.get("/api/qr/:code", (req, res) => {
    const code = String(req.params.code || "").trim();
    const row = getByCode(code);
    if (!row) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, data: row, url: `/q/${encodeURIComponent(code)}` });
  });

  app.get("/api/admin/list", requireAdmin, (req, res) => {
    res.json({ ok: true, items: listAll() });
  });

  app.post("/api/admin/upload-excel", requireAdmin, upload.single("file"), (req, res) => {
    if (!req.file?.buffer) return res.status(400).json({ ok: false, error: "No file" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    const normalized = [];
    for (const r of rows) {
      const row = normalizeRow(r);
      if (row) normalized.push(row);
    }

    const result = upsertMany(normalized);
    res.json({ ok: true, received: rows.length, upserted: result.upserted });
  });

  app.get("/api/admin/export-excel", requireAdmin, (req, res) => {
    const buf = exportToXlsxBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="qr-data-export.xlsx"`);
    res.send(buf);
  });

  app.get("/api/admin/export", requireAdmin, async (req, res) => {
    const code = String(req.query.code || "").trim();
    const format = String(req.query.format || "png").toLowerCase();

    const row = getByCode(code);
    if (!row) return res.status(404).json({ ok: false, error: "Not found" });

    const url = `${req.protocol}://${req.get("host")}/q/${encodeURIComponent(code)}`;

    const pngDataUrl = await QRCode.toDataURL(url, { margin: 2, scale: 10 });
    const pngBase64 = pngDataUrl.split(",")[1];
    const pngBytes = Buffer.from(pngBase64, "base64");

    if (format === "png") {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="qr-${code}.png"`);
      return res.send(pngBytes);
    }

    if (format === "pdf") {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595.28, 841.89]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);

      const img = await pdf.embedPng(pngBytes);
      const imgW = 260, imgH = 260;

      const x = 40;
      const y = 841.89 - 40 - imgH;

      page.drawImage(img, { x, y, width: imgW, height: imgH });

      const lines = [
        `Code: ${row.code}`,
        `Product Name: ${row.productName}`,
        `Batch/Serial: ${row.batch}`,
        `MFG Date: ${row.mfgDate}`,
        `EXP Date: ${row.expDate}`,
        `Note/Extra: ${row.note}`,
        `Status: ${row.status}`,
        `URL: ${url}`
      ];

      let ty = y - 20;
      for (const l of lines) {
        page.drawText(l, { x, y: ty, size: 11, font });
        ty -= 16;
      }

      const pdfBytes = await pdf.save();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="qr-${code}.pdf"`);
      return res.send(Buffer.from(pdfBytes));
    }

    return res.status(400).json({ ok: false, error: "format must be png|pdf" });
  });

  // pages
  app.get("/q/:code", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "qr.html")));
  app.get("/admin", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));
  app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

  return app;
}

export async function startServer(port = Number(process.env.PORT || 3000)) {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => {
      const actualPort = server.address().port;
      resolve({ server, port: actualPort });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startServer(Number(process.env.PORT || 3000));
  console.log(`✅ V2 Online running at http://127.0.0.1:${port}`);
}
