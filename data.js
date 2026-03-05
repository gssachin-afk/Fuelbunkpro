/**
 * FuelBunk Pro — Data API Routes
 * Generic CRUD matching FuelDB interface + tenant management
 */
const express = require('express');
const { hashPassword } = require('./schema');
const { requireRole, auditLog, sanitizeString } = require('./security');

// Map frontend store names → SQL tables + their key columns
const STORE_MAP = {
  sales:              { table: 'sales',              hasAutoId: true },
  tanks:              { table: 'tanks',              hasAutoId: false, keyCol: 'id' },
  pumps:              { table: 'pumps',              hasAutoId: false, keyCol: 'id' },
  dipReadings:        { table: 'dip_readings',       hasAutoId: true },
  expenses:           { table: 'expenses',           hasAutoId: true },
  fuelPurchases:      { table: 'fuel_purchases',     hasAutoId: true },
  creditCustomers:    { table: 'credit_customers',   hasAutoId: true },
  creditTransactions: { table: 'credit_transactions', hasAutoId: true },
  employees:          { table: 'employees',          hasAutoId: true },
  shifts:             { table: 'shifts',             hasAutoId: false, keyCol: 'id' },
  settings:           { table: 'settings',           hasAutoId: false, keyCol: 'key' },
  auditLog:           { table: 'audit_log',          hasAutoId: true },
};

function dataRoutes(db) {
  const router = express.Router();

  // ═══════════════════════════════════════════
  // TENANT MANAGEMENT (Super Admin only)
  // ═══════════════════════════════════════════

  // List tenants (public — needed for station selector)
  router.get('/tenants', (req, res) => {
    const tenants = db.prepare('SELECT id, name, location, icon, color, color_light, active, station_code FROM tenants ORDER BY name').all();
    res.json(tenants);
  });

  // Create tenant
  router.post('/tenants', requireRole('super'), (req, res) => {
    const { id, name, location, ownerName, phone, icon, color, colorLight, stationCode } = req.body;
    if (!name || name.length < 2) return res.status(400).json({ error: 'Station name required' });

    const tenantId = id || ('stn_' + Date.now());
    const existing = db.prepare('SELECT id FROM tenants WHERE name = ?').get(name);
    if (existing) return res.status(409).json({ error: 'Station name already exists' });

    db.prepare(`INSERT INTO tenants (id, name, location, owner_name, phone, icon, color, color_light, station_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      tenantId, name, location || '', ownerName || '', phone || '',
      icon || '⛽', color || '#d4940f', colorLight || '#f0b429', stationCode || ''
    );

    auditLog(req, 'CREATE_TENANT', 'tenants', tenantId, name);
    res.json({ success: true, id: tenantId });
  });

  // Update tenant
  router.put('/tenants/:id', requireRole('super'), (req, res) => {
    const { name, location, ownerName, phone, icon, active, stationCode } = req.body;
    db.prepare(`UPDATE tenants SET name=COALESCE(?,name), location=COALESCE(?,location),
      owner_name=COALESCE(?,owner_name), phone=COALESCE(?,phone), icon=COALESCE(?,icon),
      active=COALESCE(?,active), station_code=COALESCE(?,station_code), updated_at=datetime('now')
      WHERE id=?`).run(name, location, ownerName, phone, icon, active, stationCode, req.params.id);
    res.json({ success: true });
  });

  // Delete tenant
  router.delete('/tenants/:id', requireRole('super'), (req, res) => {
    const id = req.params.id;
    auditLog(req, 'DELETE_TENANT', 'tenants', id, '');
    db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
    res.json({ success: true });
  });

  // Manage admin users for a tenant (Super Admin)
  router.get('/tenants/:id/admins', requireRole('super'), (req, res) => {
    const admins = db.prepare('SELECT id, name, username, role, active, created_at FROM admin_users WHERE tenant_id = ?')
      .all(req.params.id);
    res.json(admins);
  });

  router.post('/tenants/:id/admins', requireRole('super'), async (req, res) => {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password too short' });

    const exists = db.prepare('SELECT id FROM admin_users WHERE tenant_id = ? AND username = ?')
      .get(req.params.id, username);
    if (exists) return res.status(409).json({ error: 'Username already exists' });

    const result = db.prepare(`INSERT INTO admin_users (tenant_id, name, username, pass_hash, role)
      VALUES (?, ?, ?, ?, ?)`).run(req.params.id, name, username, hashPassword(password), role || 'Manager');
    res.json({ success: true, id: result.lastInsertRowid });
  });

  router.delete('/tenants/:tid/admins/:uid', requireRole('super'), (req, res) => {
    db.prepare('DELETE FROM admin_users WHERE id = ? AND tenant_id = ?').run(req.params.uid, req.params.tid);
    res.json({ success: true });
  });

  router.post('/tenants/:tid/admins/:uid/reset-password', requireRole('super'), (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });
    db.prepare('UPDATE admin_users SET pass_hash = ? WHERE id = ? AND tenant_id = ?')
      .run(hashPassword(newPassword), req.params.uid, req.params.tid);
    res.json({ success: true });
  });

  // ═══════════════════════════════════════════
  // GENERIC CRUD (mirrors FuelDB interface)
  // ═══════════════════════════════════════════

  // GET /api/data/:store — getAll
  router.get('/:store', (req, res) => {
    const storeName = req.params.store;
    const meta = STORE_MAP[storeName];
    if (!meta) return res.status(404).json({ error: `Unknown store: ${storeName}` });

    try {
      const rows = db.prepare(`SELECT * FROM ${meta.table} WHERE tenant_id = ? ORDER BY ${meta.hasAutoId ? 'id DESC' : 'rowid DESC'}`).all(req.tenantId);
      // Parse data_json back into object for each row
      const parsed = rows.map(r => {
        const obj = { ...r };
        if (r.data_json) {
          try { Object.assign(obj, JSON.parse(r.data_json)); } catch {}
        }
        delete obj.data_json;
        delete obj.tenant_id;
        return obj;
      });
      res.json(parsed);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/data/:store/:id — get by key
  router.get('/:store/:id', (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });

    const keyCol = meta.keyCol || 'id';
    const row = db.prepare(`SELECT * FROM ${meta.table} WHERE ${keyCol} = ? AND tenant_id = ?`)
      .get(req.params.id, req.tenantId);

    if (!row) return res.status(404).json({ error: 'Not found' });

    const obj = { ...row };
    if (row.data_json) {
      try { Object.assign(obj, JSON.parse(row.data_json)); } catch {}
    }
    delete obj.data_json;
    delete obj.tenant_id;
    res.json(obj);
  });

  // POST /api/data/:store — add (auto-increment ID)
  router.post('/:store', (req, res) => {
    const storeName = req.params.store;
    const meta = STORE_MAP[storeName];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });

    try {
      const data = req.body;
      const result = upsertRow(db, meta, req.tenantId, data, true);
      auditLog(req, 'CREATE', storeName, result.id || '', '');
      res.json({ success: true, id: result.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/data/:store — put (upsert)
  router.put('/:store', (req, res) => {
    const storeName = req.params.store;
    const meta = STORE_MAP[storeName];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });

    try {
      const data = req.body;
      const result = upsertRow(db, meta, req.tenantId, data, false);
      auditLog(req, 'UPDATE', storeName, result.id || '', '');
      res.json({ success: true, id: result.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/data/:store/bulk — bulkPut
  router.put('/:store/bulk', (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });

    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });

    const insertMany = db.transaction((rows) => {
      for (const data of rows) {
        upsertRow(db, meta, req.tenantId, data, false);
      }
    });
    insertMany(items);
    res.json({ success: true, count: items.length });
  });

  // DELETE /api/data/:store/:id
  router.delete('/:store/:id', (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });

    const keyCol = meta.keyCol || 'id';
    db.prepare(`DELETE FROM ${meta.table} WHERE ${keyCol} = ? AND tenant_id = ?`).run(req.params.id, req.tenantId);
    auditLog(req, 'DELETE', req.params.store, req.params.id, '');
    res.json({ success: true });
  });

  // DELETE /api/data/:store — clear all
  router.delete('/:store', requireRole('super', 'admin'), (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });

    db.prepare(`DELETE FROM ${meta.table} WHERE tenant_id = ?`).run(req.tenantId);
    auditLog(req, 'CLEAR', req.params.store, '', '');
    res.json({ success: true });
  });

  // GET /api/data/:store/by-index/:index/:value
  router.get('/:store/by-index/:index/:value', (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });

    // Map index names to column names
    const colMap = {
      date: 'date', fuelType: 'fuel_type', fuel_type: 'fuel_type',
      mode: 'mode', shift: 'shift', tankId: 'tank_id', tank_id: 'tank_id',
      category: 'category', customerId: 'customer_id', customer_id: 'customer_id',
      timestamp: 'timestamp', user: 'user_name', action: 'action'
    };
    const col = colMap[req.params.index];
    if (!col) return res.status(400).json({ error: 'Unknown index' });

    const rows = db.prepare(`SELECT * FROM ${meta.table} WHERE ${col} = ? AND tenant_id = ?`)
      .all(req.params.value, req.tenantId);
    res.json(rows.map(r => {
      const obj = { ...r };
      if (r.data_json) { try { Object.assign(obj, JSON.parse(r.data_json)); } catch {} }
      delete obj.data_json; delete obj.tenant_id;
      return obj;
    }));
  });

  // Settings helpers
  router.get('/settings/key/:key', (req, res) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ? AND tenant_id = ?')
      .get(req.params.key, req.tenantId);
    if (!row) return res.json({ value: null });
    try { res.json({ value: JSON.parse(row.value) }); } catch { res.json({ value: row.value }); }
  });

  router.put('/settings/key/:key', (req, res) => {
    const { value } = req.body;
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    db.prepare(`INSERT OR REPLACE INTO settings (key, tenant_id, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))`).run(req.params.key, req.tenantId, serialized);
    res.json({ success: true });
  });

  return router;
}

// ═══════════════════════════════════════════
// UPSERT HELPER — maps JSON data to SQL columns
// ═══════════════════════════════════════════
function upsertRow(db, meta, tenantId, data, isInsert) {
  const table = meta.table;

  // Get table columns
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

  // Separate known columns from extra data
  const known = {};
  const extra = {};
  const camelToSnake = s => s.replace(/([A-Z])/g, '_$1').toLowerCase();

  for (const [k, v] of Object.entries(data)) {
    const snakeKey = camelToSnake(k);
    if (cols.includes(snakeKey) && snakeKey !== 'tenant_id' && snakeKey !== 'data_json') {
      known[snakeKey] = v;
    } else if (cols.includes(k) && k !== 'tenant_id' && k !== 'data_json') {
      known[k] = v;
    } else if (k !== 'tenant_id' && k !== 'data_json') {
      extra[k] = v;
    }
  }

  known.tenant_id = tenantId;
  if (Object.keys(extra).length > 0 && cols.includes('data_json')) {
    known.data_json = JSON.stringify(extra);
  }

  if (meta.hasAutoId && isInsert) {
    // Remove id for auto-increment insert
    delete known.id;
    const colNames = Object.keys(known);
    const placeholders = colNames.map(() => '?').join(',');
    const values = colNames.map(c => known[c]);
    const result = db.prepare(`INSERT INTO ${table} (${colNames.join(',')}) VALUES (${placeholders})`).run(...values);
    return { id: result.lastInsertRowid };
  }

  // Upsert (INSERT OR REPLACE)
  const colNames = Object.keys(known);
  const placeholders = colNames.map(() => '?').join(',');
  const values = colNames.map(c => known[c]);
  db.prepare(`INSERT OR REPLACE INTO ${table} (${colNames.join(',')}) VALUES (${placeholders})`).run(...values);
  return { id: known.id || known.key || null };
}

module.exports = dataRoutes;
