// server.js
"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const { db, initDb, dbPath } = require("./src/src/db");

initDb();

const app = express();
app.use(express.json({ limit: "10mb" }));

const WWW_DIR = path.join(__dirname, "www");

// --- Serve web pages (online chạy luôn) ---
app.use("/", express.static(WWW_DIR));

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true, dbPath }));

// Get base url (để UI biết QR phải encode gì)
app.get("/api/base-url", (req, res) => {
  // Ưu tiên env BASE_URL (online), nếu không có thì lấy origin request
  const env = (process.env.BASE_URL || "").trim();
  const origin = `${req.protocol}://${req.get("host")}`;
  const baseUrl = env || origin;
  res.json({ ok: true, baseUrl });
});

// Upsert product by code (token)
app.post("/api/qr/upsert", (req, res) => {
  const p = req.body || {};
  const code = String(p.code || "").trim();
  if (!code) return res.status(400).send("Missing code");

  db.prepare(`
    INSERT INTO products(code, product_name, batch_serial, mfg_date, exp_date, note_extra, status, updated_at)
    VALUES(@code, @product_name, @batch_serial, @mfg_date, @exp_date, @note_extra, @status, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET
      product_name=excluded.product_name,
      batch_serial=excluded.batch_serial,
      mfg_date=excluded.mfg_date,
      exp_date=excluded.exp_date,
      note_extra=excluded.note_extra,
      status=excluded.status,
      updated_at=datetime('now')
  `).run({
    code,
    product_name: p.product_name || "",
    batch_serial: p.batch_serial || "",
    mfg_date: p.mfg_date || "",
    exp_date: p.exp_date || "",
    note_extra: p.note_extra || "",
    status: p.status || "active"
  });

  db.prepare(`INSERT INTO scan_logs(code, action, created_at, meta) VALUES(?, 'created', datetime('now'), ?)`)
    .run(code, JSON.stringify({ by: "generate" }));

  res.json({ ok: true, code });
});

// JSON scan data
app.get("/api/scan", (req, res) => {
  const code = String(req.query.token || "").trim();
  if (!code) return res.status(400).json({ ok: false, message: "Missing token" });

  const row = db.prepare(`SELECT * FROM products WHERE code=?`).get(code);
  db.prepare(`INSERT INTO scan_logs(code, action, created_at, meta) VALUES(?, 'scan', datetime('now'), ?)`)
    .run(code, JSON.stringify({ ua: req.get("user-agent") || "" }));

  if (!row) return res.status(404).json({ ok: false, message: "Not found", code });
  res.json({ ok: true, data: row });
});

// Scan HTML page endpoint (đúng link QR https://.../scan?token=...)
app.get("/scan", (_req, res) => {
  res.sendFile(path.join(WWW_DIR, "qr.html"));
});

// History
app.get("/api/history", (_req, res) => {
  const rows = db.prepare(`
    SELECT id, code, action, created_at, meta
    FROM scan_logs
    ORDER BY id DESC
    LIMIT 500
  `).all();
  res.json({ ok: true, rows });
});

// Export Excel
app.get("/api/excel/export", (_req, res) => {
  const rows = db.prepare(`SELECT * FROM products ORDER BY updated_at DESC`).all();
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "products");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=products.xlsx");
  res.send(buf);
});

// Import Excel (POST base64)
app.post("/api/excel/import", (req, res) => {
  const { base64 } = req.body || {};
  if (!base64) return res.status(400).send("Missing base64");

  const buffer = Buffer.from(base64, "base64");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const stmt = db.prepare(`
    INSERT INTO products(code, product_name, batch_serial, mfg_date, exp_date, note_extra, status, updated_at)
    VALUES(@code, @product_name, @batch_serial, @mfg_date, @exp_date, @note_extra, @status, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET
      product_name=excluded.product_name,
      batch_serial=excluded.batch_serial,
      mfg_date=excluded.mfg_date,
      exp_date=excluded.exp_date,
      note_extra=excluded.note_extra,
      status=excluded.status,
      updated_at=datetime('now')
  `);

  const tx = db.transaction((items) => {
    for (const r of items) {
      const code = String(r.code || r.Code || r.token || "").trim();
      if (!code) continue;
      stmt.run({
        code,
        product_name: r.product_name || r["Product Name"] || "",
        batch_serial: r.batch_serial || r["Batch/Serial"] || "",
        mfg_date: r.mfg_date || r["MFG Date"] || "",
        exp_date: r.exp_date || r["EXP Date"] || "",
        note_extra: r.note_extra || r["Note/Extra"] || "",
        status: r.status || r["Status"] || "active"
      });
    }
  });

  tx(rows);

  db.prepare(`INSERT INTO scan_logs(code, action, created_at, meta) VALUES('', 'import', datetime('now'), ?)`)
    .run(JSON.stringify({ rows: rows.length }));

  res.json({ ok: true, imported: rows.length });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server listening on", PORT);
  console.log("BASE_URL =", process.env.BASE_URL || "(auto)");
});
