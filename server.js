"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const HOST = "127.0.0.1";
const WANT_PORT = Number(process.env.PORT || 0); // ✅ 0 = port động

const app = express();
app.use(express.json({ limit: "2mb" }));

const DB_DIR = process.env.APP_DB_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, "qrfactory.sqlite");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  code TEXT PRIMARY KEY,
  product_name TEXT,
  batch_serial TEXT,
  mfg_date TEXT,
  exp_date TEXT,
  note_extra TEXT,
  status TEXT,
  updated_at TEXT
);
`);

const nowISO = () => new Date().toISOString();
const genCode = () => "QR" + Math.random().toString(36).slice(2, 10).toUpperCase();

let BASE_URL = ""; // set sau khi listen xong

app.get("/api/health", (_req, res) => res.json({ ok: true, db: DB_PATH, baseUrl: BASE_URL }));

app.post("/api/qr", (req, res) => {
  const b = req.body || {};
  let code = String(b.code || "").trim();
  if (!code) code = genCode(); // ✅ không còn Missing code

  const row = {
    code,
    product_name: b.product_name || "",
    batch_serial: b.batch_serial || "",
    mfg_date: b.mfg_date || "",
    exp_date: b.exp_date || "",
    note_extra: b.note_extra || "",
    status: b.status || "active",
    updated_at: nowISO(),
  };

  db.prepare(`
    INSERT INTO products(code, product_name, batch_serial, mfg_date, exp_date, note_extra, status, updated_at)
    VALUES(@code,@product_name,@batch_serial,@mfg_date,@exp_date,@note_extra,@status,@updated_at)
    ON CONFLICT(code) DO UPDATE SET
      product_name=excluded.product_name,
      batch_serial=excluded.batch_serial,
      mfg_date=excluded.mfg_date,
      exp_date=excluded.exp_date,
      note_extra=excluded.note_extra,
      status=excluded.status,
      updated_at=excluded.updated_at
  `).run(row);

  const scanUrl = `${BASE_URL}/qr.html?token=${encodeURIComponent(code)}`; // ✅ đúng format
  res.json({ ok: true, code, scanUrl });
});

app.get("/api/scan", (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token) return res.status(400).json({ ok: false, error: "missing token" });

  const r = db.prepare(`SELECT * FROM products WHERE code=?`).get(token);
  if (!r) return res.status(404).json({ ok: false, error: "not found" });

  res.json({ ok: true, data: r });
});

// ✅ Admin FULL danh sách (không phụ thuộc history)
app.get("/api/products", (req, res) => {
  const q = String(req.query.q || "").trim();
  const rows = !q
    ? db.prepare(`SELECT * FROM products ORDER BY updated_at DESC`).all()
    : db.prepare(`
        SELECT * FROM products
        WHERE code LIKE ? OR product_name LIKE ? OR batch_serial LIKE ?
        ORDER BY updated_at DESC
      `).all(`%${q}%`, `%${q}%`, `%${q}%`);
  res.json({ ok: true, rows });
});

// serve www
app.use(express.static(path.join(__dirname, "www")));

const server = app.listen(WANT_PORT, HOST, () => {
  const realPort = server.address().port;
  BASE_URL = `http://${HOST}:${realPort}`;

  console.log(`[server] listening ${BASE_URL} | db=${DB_PATH}`);
  console.log(`__PORT__=${realPort}`); // ✅ main.cjs sẽ parse dòng này
});
