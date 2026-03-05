/**
 * FuelBunk Pro — Database Schema
 * Uses better-sqlite3 with sql.js fallback
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'fuelbunk.db');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function initDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  console.log('[DB] Opening database at', DB_PATH);

  let db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    console.log('[DB] Using better-sqlite3');
  } catch (e) {
    console.warn('[DB] better-sqlite3 unavailable, trying sql.js:', e.message);
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs({
      locateFile: file => {
        const locations = [
          path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
          path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
        ];
        for (const loc of locations) {
          if (fs.existsSync(loc)) { console.log('[DB] WASM found at', loc); return loc; }
        }
        return file;
      }
    });
    const rawDb = fs.existsSync(DB_PATH)
      ? new SQL.Database(fs.readFileSync(DB_PATH))
      : new SQL.Database();
    db = wrapSqlJs(rawDb, DB_PATH);
    console.log('[DB] Using sql.js');
  }

  createSchema(db);
  seedData(db);

  const tables = db.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table'").get();
  console.log('[DB] Ready —', tables.cnt, 'tables');
  return db;
}

function createSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS super_admin (id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL, pass_hash TEXT NOT NULL, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT DEFAULT '', owner_name TEXT DEFAULT '', phone TEXT DEFAULT '', icon TEXT DEFAULT '⛽', color TEXT DEFAULT '#d4940f', color_light TEXT DEFAULT '#f0b429', station_code TEXT DEFAULT '', active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, name TEXT NOT NULL, username TEXT NOT NULL, pass_hash TEXT NOT NULL, role TEXT DEFAULT 'Manager', active INTEGER DEFAULT 1, created_at TEXT, UNIQUE(tenant_id, username))`,
    `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, tenant_id TEXT DEFAULT '', user_id INTEGER DEFAULT 0, user_type TEXT NOT NULL, user_name TEXT DEFAULT '', role TEXT DEFAULT '', created_at TEXT, expires_at TEXT NOT NULL, ip_address TEXT DEFAULT '', user_agent TEXT DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS tanks (id TEXT NOT NULL, tenant_id TEXT NOT NULL, fuel_type TEXT DEFAULT '', name TEXT DEFAULT '', capacity REAL DEFAULT 0, current_level REAL DEFAULT 0, low_alert REAL DEFAULT 500, unit TEXT DEFAULT 'L', data_json TEXT DEFAULT '{}', updated_at TEXT, PRIMARY KEY(id, tenant_id))`,
    `CREATE TABLE IF NOT EXISTS pumps (id TEXT NOT NULL, tenant_id TEXT NOT NULL, name TEXT DEFAULT '', fuel_type TEXT DEFAULT '', tank_id TEXT DEFAULT '', current_reading REAL DEFAULT 0, status TEXT DEFAULT 'active', data_json TEXT DEFAULT '{}', updated_at TEXT, PRIMARY KEY(id, tenant_id))`,
    `CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, date TEXT DEFAULT '', fuel_type TEXT DEFAULT '', liters REAL DEFAULT 0, amount REAL DEFAULT 0, rate REAL DEFAULT 0, mode TEXT DEFAULT 'cash', pump TEXT DEFAULT '', nozzle TEXT DEFAULT '', shift TEXT DEFAULT '', vehicle TEXT DEFAULT '', customer TEXT DEFAULT '', employee_id INTEGER DEFAULT 0, employee_name TEXT DEFAULT '', notes TEXT DEFAULT '', data_json TEXT DEFAULT '{}', created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS dip_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, tank_id TEXT DEFAULT '', date TEXT DEFAULT '', reading REAL DEFAULT 0, computed_volume REAL DEFAULT 0, shift TEXT DEFAULT '', recorded_by TEXT DEFAULT '', notes TEXT DEFAULT '', data_json TEXT DEFAULT '{}', created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, date TEXT DEFAULT '', category TEXT DEFAULT 'General', description TEXT DEFAULT '', amount REAL DEFAULT 0, paid_to TEXT DEFAULT '', mode TEXT DEFAULT 'cash', receipt_ref TEXT DEFAULT '', approved_by TEXT DEFAULT '', data_json TEXT DEFAULT '{}', created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS fuel_purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, date TEXT DEFAULT '', fuel_type TEXT DEFAULT '', liters REAL DEFAULT 0, amount REAL DEFAULT 0, rate REAL DEFAULT 0, tank_id TEXT DEFAULT '', supplier TEXT DEFAULT '', invoice_no TEXT DEFAULT '', notes TEXT DEFAULT '', data_json TEXT DEFAULT '{}', created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS credit_customers (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, name TEXT DEFAULT '', phone TEXT DEFAULT '', vehicle TEXT DEFAULT '', company TEXT DEFAULT '', credit_limit REAL DEFAULT 0, balance REAL DEFAULT 0, active INTEGER DEFAULT 1, data_json TEXT DEFAULT '{}', created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS credit_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, customer_id INTEGER DEFAULT 0, date TEXT DEFAULT '', type TEXT DEFAULT 'sale', amount REAL DEFAULT 0, description TEXT DEFAULT '', sale_id INTEGER DEFAULT 0, data_json TEXT DEFAULT '{}', created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, name TEXT DEFAULT '', phone TEXT DEFAULT '', role TEXT DEFAULT 'attendant', pin_hash TEXT DEFAULT '', active INTEGER DEFAULT 1, salary REAL DEFAULT 0, join_date TEXT DEFAULT '', color TEXT DEFAULT '', data_json TEXT DEFAULT '{}', created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS shifts (id TEXT NOT NULL, tenant_id TEXT NOT NULL, name TEXT DEFAULT '', start_time TEXT DEFAULT '', end_time TEXT DEFAULT '', status TEXT DEFAULT 'open', data_json TEXT DEFAULT '{}', updated_at TEXT, PRIMARY KEY(id, tenant_id))`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT NOT NULL, tenant_id TEXT NOT NULL, value TEXT, updated_at TEXT, PRIMARY KEY(key, tenant_id))`,
    `CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT DEFAULT '', timestamp TEXT, user_name TEXT DEFAULT '', user_type TEXT DEFAULT '', action TEXT DEFAULT '', entity TEXT DEFAULT '', entity_id TEXT DEFAULT '', details TEXT DEFAULT '', ip_address TEXT DEFAULT '', created_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_address TEXT DEFAULT '', username TEXT DEFAULT '', tenant_id TEXT DEFAULT '', success INTEGER DEFAULT 0, attempted_at TEXT)`,
  ];
  for (const sql of statements) {
    try { db.prepare(sql).run(); } catch(e) { console.warn('[Schema]', e.message); }
  }
}

function seedData(db) {
  const existing = db.prepare('SELECT id FROM super_admin WHERE id = 1').get();
  if (!existing) {
    db.prepare('INSERT INTO super_admin (id, username, pass_hash, updated_at) VALUES (?, ?, ?, ?)')
      .run(1, 'superadmin', hashPassword('FuelBunk@Super2026'), new Date().toISOString());
    console.log('[DB] Seeded: superadmin / FuelBunk@Super2026');
  }
  try { db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString()); } catch {}
}

function wrapSqlJs(rawDb, filePath) {
  let dirty = false;
  const saveInterval = setInterval(() => { if (dirty) saveToDisk(); }, 5000);

  function saveToDisk() {
    try {
      fs.writeFileSync(filePath, Buffer.from(rawDb.export()));
      dirty = false;
    } catch(e) { console.error('[DB] Save error:', e.message); }
  }

  return {
    pragma(s) { try { rawDb.run('PRAGMA ' + s); } catch {} },
    prepare(sql) {
      return {
        run(...params) {
          rawDb.run(sql, params); dirty = true;
          const lid = rawDb.exec('SELECT last_insert_rowid()');
          return { lastInsertRowid: lid[0]?.values[0]?.[0] || 0, changes: rawDb.getRowsModified() };
        },
        get(...params) {
          try {
            const stmt = rawDb.prepare(sql);
            if (params.length) stmt.bind(params);
            if (stmt.step()) {
              const cols = stmt.getColumnNames(), vals = stmt.get();
              stmt.free();
              const row = {}; cols.forEach((c, i) => row[c] = vals[i]); return row;
            }
            stmt.free();
          } catch(e) { console.warn('[SQL get]', e.message); }
          return undefined;
        },
        all(...params) {
          const rows = [];
          try {
            const stmt = rawDb.prepare(sql);
            if (params.length) stmt.bind(params);
            while (stmt.step()) {
              const cols = stmt.getColumnNames(), vals = stmt.get();
              const row = {}; cols.forEach((c, i) => row[c] = vals[i]); rows.push(row);
            }
            stmt.free();
          } catch(e) { console.warn('[SQL all]', e.message); }
          return rows;
        }
      };
    },
    transaction(fn) {
      return (...args) => {
        rawDb.run('BEGIN TRANSACTION');
        try { const r = fn(...args); rawDb.run('COMMIT'); dirty = true; return r; }
        catch(e) { rawDb.run('ROLLBACK'); throw e; }
      };
    },
    close() { clearInterval(saveInterval); saveToDisk(); rawDb.close(); }
  };
}

module.exports = { initDatabase, hashPassword, DB_PATH, DB_DIR };
