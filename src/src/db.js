const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(process.cwd(), "qr_factory.sqlite");
const db = new Database(dbPath);

function initDb() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS products(
      code TEXT PRIMARY KEY,
      product_name TEXT,
      batch_serial TEXT,
      mfg_date TEXT,
      exp_date TEXT,
      note_extra TEXT,
      status TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS scan_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      action TEXT,
      created_at TEXT
    );
  `);
}

module.exports = { db, initDb };
