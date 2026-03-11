/**
 * FuelBunk Pro — Data API Routes (PostgreSQL async)
 */
const express = require('express');
const { hashPassword } = require('./schema');
const { requireRole, auditLog } = require('./security');

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

  // List tenants (public)
  router.get('/tenants', async (req, res) => {
    try {
      const tenants = await db.prepare('SELECT id, name, location, icon, color, color_light, active, station_code FROM tenants ORDER BY name').all();
      res.json(tenants);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Create tenant
  router.post('/tenants', requireRole('super'), async (req, res) => {
    const { id, name, location, ownerName, phone, icon, color, colorLight, stationCode, adminUser, adminPass } = req.body;
    if (!name || name.length < 2) return res.status(400).json({ error: 'Station name required' });
    try {
      const tenantId = id || ('stn_' + Date.now());
      const existing = await db.prepare('SELECT id FROM tenants WHERE name = $1').get(name);
      if (existing) return res.status(409).json({ error: 'Station name already exists' });

      await db.prepare(
        'INSERT INTO tenants (id, name, location, owner_name, phone, icon, color, color_light, station_code, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)'
      ).run(tenantId, name, location||'', ownerName||'', phone||'', icon||'⛽', color||'#d4940f', colorLight||'#f0b429', stationCode||'', 1);

      // Create admin user if provided
      if (adminUser && adminPass) {
        try {
          await db.prepare(
            'INSERT INTO admin_users (tenant_id, name, username, pass_hash, role) VALUES ($1,$2,$3,$4,$5)'
          ).run(tenantId, ownerName||adminUser, adminUser, hashPassword(adminPass), 'Owner');
        } catch (e) { console.warn('[Tenant] Admin user creation failed:', e.message); }
      }

      await auditLog(req, 'CREATE_TENANT', 'tenants', tenantId, name);
      res.json({ success: true, id: tenantId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Update tenant
  router.put('/tenants/:id', requireRole('super'), async (req, res) => {
    const { name, location, ownerName, phone, icon, active, stationCode } = req.body;
    try {
      await db.prepare(
        'UPDATE tenants SET name=COALESCE($1,name), location=COALESCE($2,location), owner_name=COALESCE($3,owner_name), phone=COALESCE($4,phone), icon=COALESCE($5,icon), active=COALESCE($6,active), station_code=COALESCE($7,station_code), updated_at=NOW() WHERE id=$8'
      ).run(name, location, ownerName, phone, icon, active !== undefined ? (active ? 1 : 0) : null, stationCode, req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Delete tenant
  router.delete('/tenants/:id', requireRole('super'), async (req, res) => {
    try {
      await auditLog(req, 'DELETE_TENANT', 'tenants', req.params.id, '');
      await db.prepare('DELETE FROM tenants WHERE id = $1').run(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Tenant admins
  router.get('/tenants/:id/admins', requireRole('super'), async (req, res) => {
    try {
      const admins = await db.prepare('SELECT id, name, username, role, active, created_at FROM admin_users WHERE tenant_id = $1').all(req.params.id);
      res.json(admins);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/tenants/:id/admins', requireRole('super'), async (req, res) => {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
    try {
      const exists = await db.prepare('SELECT id FROM admin_users WHERE tenant_id = $1 AND username = $2').get(req.params.id, username);
      if (exists) return res.status(409).json({ error: 'Username already exists' });
      const result = await db.prepare('INSERT INTO admin_users (tenant_id, name, username, pass_hash, role) VALUES ($1,$2,$3,$4,$5)').run(req.params.id, name, username, hashPassword(password), role||'Manager');
      res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/tenants/:tid/admins/:uid', requireRole('super'), async (req, res) => {
    try {
      await db.prepare('DELETE FROM admin_users WHERE id = $1 AND tenant_id = $2').run(req.params.uid, req.params.tid);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/tenants/:tid/admins/:uid/reset-password', requireRole('super'), async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });
    try {
      await db.prepare('UPDATE admin_users SET pass_hash = $1 WHERE id = $2 AND tenant_id = $3').run(hashPassword(newPassword), req.params.uid, req.params.tid);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET all rows for a store
  router.get('/:store', async (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: `Unknown store: ${req.params.store}` });
    try {
      const rows = await db.prepare(`SELECT * FROM ${meta.table} WHERE tenant_id = $1 ORDER BY id DESC`).all(req.tenantId);
      res.json(rows.map(parseRow));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET by key
  router.get('/:store/:id', async (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });
    const keyCol = meta.keyCol || 'id';
    try {
      const row = await db.prepare(`SELECT * FROM ${meta.table} WHERE ${keyCol} = $1 AND tenant_id = $2`).get(req.params.id, req.tenantId);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(parseRow(row));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST — insert
  router.post('/:store', async (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });
    try {
      const result = await upsertRow(db, meta, req.tenantId, req.body, true);
      await auditLog(req, 'CREATE', req.params.store, result.id||'', '');
      res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PUT — upsert
  router.put('/:store', async (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });
    try {
      const result = await upsertRow(db, meta, req.tenantId, req.body, false);
      await auditLog(req, 'UPDATE', req.params.store, result.id||'', '');
      res.json({ success: true, id: result.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PUT bulk
  router.put('/:store/bulk', async (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array' });
    try {
      for (const item of req.body) await upsertRow(db, meta, req.tenantId, item, false);
      res.json({ success: true, count: req.body.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // DELETE by id
  router.delete('/:store/:id', async (req, res) => {
    const meta = STORE_MAP[req.params.store];
    if (!meta) return res.status(404).json({ error: 'Unknown store' });
    const keyCol = meta.keyCol || 'id';
    try {
      await db.prepare(`DELETE FROM ${meta.table} WHERE ${keyCol} = $1 AND tenant_id = $2`).run(req.params.id, req.tenantId);
      await auditLog(req, 'DELETE', req.params.store, req.params.id, '');
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Settings
  router.get('/settings/key/:key', async (req, res) => {
    try {
      const row = await db.prepare('SELECT value FROM settings WHERE key = $1 AND tenant_id = $2').get(req.params.key, req.tenantId);
      if (!row) return res.json({ value: null });
      try { res.json({ value: JSON.parse(row.value) }); } catch { res.json({ value: row.value }); }
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/settings/key/:key', async (req, res) => {
    const { value } = req.body;
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    try {
      await db.prepare('INSERT INTO settings (key, tenant_id, value, updated_at) VALUES ($1,$2,$3,NOW()) ON CONFLICT (key, tenant_id) DO UPDATE SET value=$3, updated_at=NOW()').run(req.params.key, req.tenantId, serialized);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

function parseRow(r) {
  const obj = { ...r };
  if (r.data_json) { try { Object.assign(obj, JSON.parse(r.data_json)); } catch {} }
  delete obj.data_json;
  delete obj.tenant_id;
  return obj;
}

function camelToSnake(s) { return s.replace(/([A-Z])/g, '_$1').toLowerCase(); }

async function upsertRow(db, meta, tenantId, data, isInsert) {
  const table = meta.table;

  // Get column names for this table from PostgreSQL
  const { pool } = require('./schema');
  const colResult = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]
  );
  const cols = colResult.rows.map(r => r.column_name);

  const known = {};
  const extra = {};

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
    delete known.id;
    const colNames = Object.keys(known);
    const placeholders = colNames.map((_, i) => `$${i + 1}`).join(',');
    const values = colNames.map(c => known[c]);
    const result = await pool.query(
      `INSERT INTO ${table} (${colNames.join(',')}) VALUES (${placeholders}) RETURNING id`,
      values
    );
    return { id: result.rows[0]?.id };
  }

  // Upsert
  const colNames = Object.keys(known);
  const placeholders = colNames.map((_, i) => `$${i + 1}`).join(',');
  const values = colNames.map(c => known[c]);
  const conflictCol = meta.keyCol ? `(${meta.keyCol}, tenant_id)` : null;

  if (conflictCol) {
    const updateCols = colNames.filter(c => c !== meta.keyCol && c !== 'tenant_id');
    const updateSet = updateCols.map((c, i) => `${c}=$${colNames.indexOf(c) + 1}`).join(',');
    await pool.query(
      `INSERT INTO ${table} (${colNames.join(',')}) VALUES (${placeholders}) ON CONFLICT ${conflictCol} DO UPDATE SET ${updateSet}`,
      values
    );
  } else {
    await pool.query(
      `INSERT INTO ${table} (${colNames.join(',')}) VALUES (${placeholders})`,
      values
    );
  }
  return { id: known.id || known.key || null };
}

module.exports = dataRoutes;
