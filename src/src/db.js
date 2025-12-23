import Database from "better-sqlite3";
import XLSX from "xlsx";

const db = new Database("data.sqlite");

export function initDb() {
  db.exec(`
    PRAGMA journal_mode=WAL;

    CREATE TABLE IF NOT EXISTS qr_codes (
      code TEXT PRIMARY KEY,
      productName TEXT,
      batch TEXT,
      mfgDate TEXT,
      expDate TEXT,
      note TEXT,
      status TEXT DEFAULT 'active',
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);
}

export function upsertOne(row) {
  const stmt = db.prepare(`
    INSERT INTO qr_codes (code, productName, batch, mfgDate, expDate, note, status, updatedAt)
    VALUES (@code, @productName, @batch, @mfgDate, @expDate, @note, @status, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET
      productName=excluded.productName,
      batch=excluded.batch,
      mfgDate=excluded.mfgDate,
      expDate=excluded.expDate,
      note=excluded.note,
      status=excluded.status,
      updatedAt=datetime('now')
  `);
  stmt.run(row);
}

export function upsertMany(rows) {
  const tx = db.transaction((items) => {
    for (const r of items) upsertOne(r);
  });
  tx(rows);
  return { upserted: rows.length };
}

export function getByCode(code) {
  return db.prepare(`SELECT * FROM qr_codes WHERE code = ?`).get(code);
}

export function listAll() {
  return db.prepare(`SELECT * FROM qr_codes ORDER BY updatedAt DESC`).all();
}

export function exportToXlsxBuffer() {
  const items = listAll();
  const ws = XLSX.utils.json_to_sheet(items);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "qr_codes");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf;
}

export function getStats() {
  const total = db.prepare(`SELECT COUNT(*) AS c FROM qr_codes`).get().c;
  const active = db.prepare(`SELECT COUNT(*) AS c FROM qr_codes WHERE status='active'`).get().c;
  const inactive = db.prepare(`SELECT COUNT(*) AS c FROM qr_codes WHERE status!='active'`).get().c;
  return { total, active, inactive };
}
