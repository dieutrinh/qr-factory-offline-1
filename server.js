const express = require("express");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { db, initDb } = require("./src/src/db");

const app = express();
app.use(express.json({ limit: "5mb" }));

initDb();

// health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// create/update by code(token)
app.post("/api/qr/upsert", (req, res) => {
  const p = req.body || {};
  if (!p.code) return res.status(400).send("Missing code");

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
    code: p.code,
    product_name: p.product_name || "",
    batch_serial: p.batch_serial || "",
    mfg_date: p.mfg_date || "",
    exp_date: p.exp_date || "",
    note_extra: p.note_extra || "",
    status: p.status || "active",
  });

  db.prepare(`
    INSERT INTO scan_logs(code, action, created_at)
    VALUES(?, 'created', datetime('now'))
  `).run(p.code);

  res.json({ ok: true, code: p.code });
});

// scan by token
app.get("/api/scan", (req, res) => {
  const code = String(req.query.token || "").trim();
  if (!code) return res.status(400).send("Missing token");

  const row = db.prepare(`SELECT * FROM products WHERE code=?`).get(code);
  db.prepare(`INSERT INTO scan_logs(code, action, created_at) VALUES(?, 'scan', datetime('now'))`).run(code);

  if (!row) return res.status(404).json({ ok: false, message: "Not found", code });
  res.json({ ok: true, data: row });
});

// history
app.get("/api/history", (_req, res) => {
  const rows = db.prepare(`
    SELECT id, code, action, created_at
    FROM scan_logs
    ORDER BY id DESC
    LIMIT 200
  `).all();
  res.json({ ok: true, rows });
});

// export Excel
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

// import Excel (POST raw base64)
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
