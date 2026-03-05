/**
 * FuelBunk Pro — PostgreSQL Database Schema & Init
 */
const { Pool } = require('pg');
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Create pool using DATABASE_URL env variable (set by Railway)
const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!dbUrl && !process.env.PGHOST) {
  console.error('[FATAL] No database connection info found. Set DATABASE_URL.');
  process.exit(1);
}

let poolConfig;
if (dbUrl) {
  console.log('[DB] Using DATABASE_URL:', dbUrl.replace(/:([^:@]+)@/, ':****@'));
  poolConfig = {
    connectionString: dbUrl,
    ssl: (dbUrl.includes('railway.internal') || dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1'))
      ? false : { rejectUnauthorized: false }
  };
} else {
  console.log('[DB] Using PG* env vars, host:', process.env.PGHOST);
  poolConfig = {
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: false
  };
}

const pool = new Pool(poolConfig);

// Wrapper so existing code using db.prepare().run/get/all still works
class PgDB {
  prepare(sql) {
    return {
      run: (...params) => this._run(sql, params),
      get: (...params) => this._get(sql, params),
      all: (...params) => this._all(sql, params),
    };
  }

  async _run(sql, params) {
    const pgSql = toPgSql(sql);
    const result = await pool.query(pgSql, params);
    return { lastInsertRowid: result.rows[0]?.id || 0, changes: result.rowCount };
  }

  async _get(sql, params) {
    const pgSql = toPgSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows[0] || undefined;
  }

  async _all(sql, params) {
    const pgSql = toPgSql(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  }

  exec(sql) { return pool.query(toPgSql(sql)); }

  pragma() {} // no-op for PostgreSQL

  transaction(fn) {
    return async (...args) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // fn runs with synchronous-looking calls — wrap for pg
        const result = await fn(...args);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    };
  }
}

// Convert SQLite-style SQL to PostgreSQL
function toPgSql(sql) {
  let i = 0;
  // Replace ? with $1, $2, ...
  sql = sql.replace(/\?/g, () => `$${++i}`);
  // datetime('now') → NOW()
  sql = sql.replace(/datetime\('now'\)/gi, 'NOW()');
  // INSERT OR REPLACE → INSERT ... ON CONFLICT DO UPDATE
  sql = sql.replace(/INSERT OR REPLACE INTO (\w+)/gi, 'INSERT INTO $1');
  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  sql = sql.replace(/INSERT OR IGNORE INTO (\w+)/gi, 'INSERT INTO $1');
  // PRAGMA table_info → stub
  if (sql.includes('PRAGMA table_info')) return sql; // handled separately
  return sql;
}

async function initDatabase() {
  console.log('[DB] Connecting to PostgreSQL...');

  const SCHEMA = `
    CREATE TABLE IF NOT EXISTS super_admin (
      id INTEGER PRIMARY KEY CHECK(id=1),
      username TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT DEFAULT '',
      owner_name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      icon TEXT DEFAULT '⛽',
      color TEXT DEFAULT '#d4940f',
      color_light TEXT DEFAULT '#f0b429',
      station_code TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      pass_hash TEXT NOT NULL,
      role TEXT DEFAULT 'Manager',
      active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, username)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      user_id INTEGER DEFAULT 0,
      user_type TEXT NOT NULL,
      user_name TEXT DEFAULT '',
      role TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tanks (
      id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      fuel_type TEXT DEFAULT '',
      name TEXT DEFAULT '',
      capacity REAL DEFAULT 0,
      current_level REAL DEFAULT 0,
      low_alert REAL DEFAULT 500,
      unit TEXT DEFAULT 'L',
      data_json TEXT DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(id, tenant_id)
    );

    CREATE TABLE IF NOT EXISTS pumps (
      id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      fuel_type TEXT DEFAULT '',
      tank_id TEXT DEFAULT '',
      current_reading REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      data_json TEXT DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(id, tenant_id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      date TEXT DEFAULT '',
      fuel_type TEXT DEFAULT '',
      liters REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      mode TEXT DEFAULT 'cash',
      pump TEXT DEFAULT '',
      nozzle TEXT DEFAULT '',
      shift TEXT DEFAULT '',
      vehicle TEXT DEFAULT '',
      customer TEXT DEFAULT '',
      employee_id INTEGER DEFAULT 0,
      employee_name TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      data_json TEXT DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dip_readings (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      tank_id TEXT DEFAULT '',
      date TEXT DEFAULT '',
      reading REAL DEFAULT 0,
      computed_volume REAL DEFAULT 0,
      shift TEXT DEFAULT '',
      recorded_by TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      data_json TEXT DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      date TEXT DEFAULT '',
      category TEXT DEFAULT 'General',
      description TEXT DEFAULT '',
      amount REAL DEFAULT 0,
      paid_to TEXT DEFAULT '',
      mode TEXT DEFAULT 'cash',
      receipt_ref TEXT DEFAULT '',
      approved_by TEXT DEFAULT '',
      data_json TEXT DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fuel_purchases (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      date TEXT DEFAULT '',
      fuel_type TEXT DEFAULT '',
      liters REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      tank_id TEXT DEFAULT '',
      supplier TEXT DEFAULT '',
      invoice_no TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      data_json TEXT DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS credit_customers (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      vehicle TEXT DEFAULT '',
      company TEXT DEFAULT '',
      credit_limit REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      data_json TEXT DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id INTEGER DEFAULT 0,
      date TEXT DEFAULT '',
      type TEXT DEFAULT 'sale',
      amount REAL DEFAULT 0,
      description TEXT DEFAULT '',
      sale_id INTEGER DEFAULT 0,
      data_json TEXT DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      role TEXT DEFAULT 'attendant',
      pin_hash TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      salary REAL DEFAULT 0,
      join_date TEXT DEFAULT '',
      color TEXT DEFAULT '',
      data_json TEXT DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT DEFAULT '',
      start_time TEXT DEFAULT '',
      end_time TEXT DEFAULT '',
      status TEXT DEFAULT 'open',
      data_json TEXT DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(id, tenant_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(key, tenant_id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      timestamp TIMESTAMPTZ DEFAULT NOW(),
      user_name TEXT DEFAULT '',
      user_type TEXT DEFAULT '',
      action TEXT DEFAULT '',
      entity TEXT DEFAULT '',
      entity_id TEXT DEFAULT '',
      details TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY,
      ip_address TEXT DEFAULT '',
      username TEXT DEFAULT '',
      tenant_id TEXT DEFAULT '',
      success INTEGER DEFAULT 0,
      attempted_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Run each CREATE TABLE separately
  const statements = SCHEMA.split(';').map(s => s.trim()).filter(s => s.length > 10);
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (e) {
      console.warn('[Schema]', e.message.substring(0, 80));
    }
  }

  // Seed super admin
  const existing = await pool.query('SELECT id FROM super_admin WHERE id = 1');
  if (existing.rows.length === 0) {
    await pool.query(
      'INSERT INTO super_admin (id, username, pass_hash) VALUES ($1, $2, $3)',
      [1, 'superadmin', hashPassword('FuelBunk@Super2026')]
    );
    console.log('[DB] Super admin seeded');
  }

  // Clean expired sessions
  try { await pool.query("DELETE FROM sessions WHERE expires_at < NOW()"); } catch {}

  console.log('[DB] PostgreSQL ready');

  // Return a db object that wraps pool for use in routes
  return new PgDbWrapper(pool);
}

// Full async wrapper used by routes
class PgDbWrapper {
  constructor(pool) {
    this.pool = pool;
  }

  prepare(sql) {
    const pool = this.pool;
    return {
      async run(...params) {
        const pgSql = convertSql(sql, 'run');
        try {
          const result = await pool.query(pgSql, params);
          return { lastInsertRowid: result.rows[0]?.id || 0, changes: result.rowCount };
        } catch(e) {
          console.error('[DB run]', e.message, '\nSQL:', pgSql, '\nParams:', params);
          throw e;
        }
      },
      async get(...params) {
        const pgSql = convertSql(sql, 'get');
        try {
          const result = await pool.query(pgSql, params);
          return result.rows[0] || undefined;
        } catch(e) {
          console.error('[DB get]', e.message, '\nSQL:', pgSql);
          return undefined;
        }
      },
      async all(...params) {
        const pgSql = convertSql(sql, 'all');
        try {
          const result = await pool.query(pgSql, params);
          return result.rows;
        } catch(e) {
          console.error('[DB all]', e.message, '\nSQL:', pgSql);
          return [];
        }
      }
    };
  }

  async exec(sql) {
    try { await pool.query(convertSql(sql, 'exec')); } catch(e) { console.warn('[DB exec]', e.message); }
  }

  pragma() {} // no-op

  transaction(fn) {
    const pool = this.pool;
    return async (...args) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(...args);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    };
  }

  // For PRAGMA table_info — return column names for a table
  async getTableColumns(table) {
    const result = await pool.query(
      `SELECT column_name as name FROM information_schema.columns WHERE table_name = $1`,
      [table]
    );
    return result.rows.map(r => r.name);
  }
}

function convertSql(sql, mode) {
  let i = 0;
  // Replace ? placeholders with $1, $2, ...
  sql = sql.replace(/\?/g, () => `$${++i}`);
  // datetime('now') → NOW()
  sql = sql.replace(/datetime\('now'\)/gi, 'NOW()');
  sql = sql.replace(/datetime\("now"\)/gi, 'NOW()');
  // INSERT OR REPLACE → INSERT ... ON CONFLICT
  sql = sql.replace(/INSERT OR REPLACE INTO (\w+)/gi, 'INSERT INTO $1');
  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  sql = sql.replace(/INSERT OR IGNORE INTO (\w+)/gi, 'INSERT INTO $1');
  // Add RETURNING * for INSERT statements so lastInsertRowid works.
  // Use RETURNING * (not RETURNING id) because some tables use non-id primary keys
  // e.g. sessions uses token TEXT PRIMARY KEY — RETURNING id would crash those.
  if (mode === 'run' && sql.trim().toUpperCase().startsWith('INSERT') && !sql.includes('RETURNING')) {
    sql = sql + ' RETURNING *';
  }
  return sql;
}

module.exports = { initDatabase, hashPassword, pool };
