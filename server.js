// server.js
"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const PORT = Number(process.env.PORT || 3000);
const HOST = "127.0.0.1";

const app = express();
app.use(express.json({ limit: "2mb" }));

// ===== DB location (portable-safe) =====
// ưu tiên lưu vào folder app (cùng repo) nếu chạy dev,
// còn khi chạy packaged thì dùng userData của electron (nếu có env APP_DB_DIR)
const DB_DIR =
  process.env.APP_DB_DIR ||
  path.join(process.cwd(), "data");

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

function nowISO() {
  return new Date().toISOString();
}

function genCode() {
  // QR + 8 ký tự
  const s = Math.random().toString(36).slice(2, 10).toUpperCase();
  return "QR" + s;
}

// Scan URL format (đúng yêu cầu: /qr.html?token=...)
// Ở EXE offline, link scan thực tế vẫn chạy vì qr.html là file local (renderer open).
// Nếu sau này bạn deploy web, chỉ cần đổi BASE_URL thành domain.
function getBaseUrl() {
  return process.env.BASE_URL || `http://${HOST}:${PORT}`;
}
function makeScanUrl(code) {
  // ✅ format theo yêu cầu user: url/qr.html?token=...
  // nếu BASE_URL là domain web => link web
  // nếu BASE_URL là http local => vẫn OK để test
  return `${getBaseUrl()}/qr.html?token=${encodeURIComponent(code)}`;
}

// ===== health =====
app.get("/api/health", (_req, res) => res.json({ ok: true, db: DB_PATH }));

// ===== create/update QR =====
app.post("/api/qr", (req, res) => {
  const b = req.body || {};

  let code = String((b.code || "")).trim();
  if (!code) code = genCode(); // ✅ FIX: không còn Missing code

  const row = {
    code,
    product_name: b.product_name || b.product || "",
    batch_serial: b.batch_serial || b.batch || "",
    mfg_date: b.mfg_date || b.mfg || "",
    exp_date: b.exp_date || b.exp || "",
    note_extra: b.note_extra || b.note || "",
    status: b.status || "active",
    updated_at: nowISO(),
  };

  const stmt = db.prepare(`
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
  `);
  stmt.run(row);

  return res.json({
    ok: true,
    code,
    scanUrl: makeScanUrl(code), // ✅ đúng format qr.html?token=
  });
});

// ===== scan =====
app.get("/api/scan", (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token) return res.status(400).json({ ok: false, error: "missing token" });

  const r = db.prepare(`SELECT * FROM products WHERE code=?`).get(token);
  if (!r) return res.status(404).json({ ok: false, error: "not found" });

  return res.json({ ok: true, data: r });
});

// ===== admin list products (FULL) =====
app.get("/api/products", (req, res) => {
  const q = String(req.query.q || "").trim();
  let rows;
  if (!q) {
    rows = db.prepare(`SELECT * FROM products ORDER BY updated_at DESC`).all();
  } else {
    rows = db.prepare(`
      SELECT * FROM products
      WHERE code LIKE ? OR product_name LIKE ? OR batch_serial LIKE ?
      ORDER BY updated_at DESC
    `).all(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  return res.json({ ok: true, rows });
});

// ===== static serve www (để BASE_URL http://127.0.0.1:PORT cũng mở được qr/admin/index) =====
app.use(express.static(path.join(__dirname, "www")));

app.listen(PORT, HOST, () => {
  console.log(`[server] listening http://${HOST}:${PORT} | db=${DB_PATH}`);
});
