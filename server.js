// server.js
"use strict";

const express = require("express");
const path = require("path");
const XLSX = require("xlsx");
const { db, initDb, dbPath } = require("./src/src/db");

initDb();

const app = express();
app.use(express.json({ limit: "10mb" }));

const WWW_DIR = path.join(__dirname, "www");
app.use("/", express.static(WWW_DIR));

/* ===== Base ===== */
app.get("/api/health", (_req, res) => res.json({ ok: true, dbPath }));

app.get("/api/base-url", (req, res) => {
  const env = (process.env.BASE_URL || "").trim();
  const origin = `${req.protocol}://${req.get("host")}`;
  res.json({ ok: true, baseUrl: env || origin });
});

/* ===== CRUD ===== */
app.post("/api/qr/upsert", (req, res) => {
  const p = req.body || {};
  const code = String(p.code || "").trim();
  if (!code) return res.status(400).send("Missing code");

  db.prepare(`
    INSERT INTO products(code, product_name, batch_serial, mfg_date, exp_date, note_extra, status, updated_at)
    VALUES(@code,@product_name,@batch_serial,@mfg_date,@exp_date,@note_extra,@status,datetime('now'))
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

  res.json({ ok: true, code });
});

/* ===== SCAN ===== */
app.get("/api/scan", (req, res) => {
  const code = String(req.query.token || "").trim();
  if (!code) return res.status(400).json({ ok: false, message: "Missing token" });

  const row = db.prepare(`SELECT * FROM products WHERE code=?`).get(code);
  if (!row) return res.status(404).json({ ok: false, message: "Not found" });

  res.json({ ok: true, data: row });
});

app.get("/scan", (_req, res) => {
  res.sendFile(path.join(WWW_DIR, "qr.html"));
});

/* ===== ✅ FULL PRODUCT LIST (KHÔNG PHỤ THUỘC HISTORY) ===== */
app.get("/api/products", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const rows = db
    .prepare(`SELECT * FROM products ORDER BY updated_at DESC`)
    .all();

  const filtered = q
    ? rows.filter(r =>
        `${r.code} ${r.product_name} ${r.batch_serial}`
          .toLowerCase()
          .includes(q)
      )
    : rows;

  res.json({ ok: true, rows: filtered });
});

/* ===== HISTORY ===== */
app.get("/api/history", (_req, res) => {
  const rows = db.prepare(`
    SELECT * FROM scan_logs
    ORDER BY id DESC
    LIMIT 300
  `).all();
  res.json({ ok: true, rows });
});

/* ===== EXCEL ===== */
app.get("/api/excel/export", (_req, res) => {
  const rows = db.prepare(`SELECT * FROM products`).all();
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "products");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Disposition", "attachment; filename=products.xlsx");
  res.send(buf);
});

app.post("/api/excel/import", (req, res) => {
  const { base64 } = req.body || {};
  if (!base64) return res.status(400).send("Missing base64");

  const buf = Buffer.from(base64, "base64");
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const stmt = db.prepare(`
    INSERT INTO products(code, product_name, batch_serial, mfg_date, exp_date, note_extra, status, updated_at)
    VALUES(@code,@product_name,@batch_serial,@mfg_date,@exp_date,@note_extra,@status,datetime('now'))
    ON CONFLICT(code) DO UPDATE SET
      product_name=excluded.product_name,
      batch_serial=excluded.batch_serial,
      mfg_date=excluded.mfg_date,
      exp_date=excluded.exp_date,
      note_extra=excluded.note_extra,
      status=excluded.status,
      updated_at=datetime('now')
  `);

  const tx = db.transaction(items => {
    for (const r of items) {
      if (!r.code) continue;
      stmt.run(r);
    }
  });
  tx(rows);

  res.json({ ok: true, imported: rows.length });
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running at", PORT);
});
