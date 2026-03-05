/**
 * FuelBunk Pro — Auth API Routes
 */
const express = require('express');
const { hashPassword } = require('./schema');
const {
  bruteForceCheck, recordLoginAttempt, createSession,
  destroySession, auditLog, requireRole
} = require('./security');

function authRoutes(db) {
  const router = express.Router();

  // ── Super Admin Login ──
  router.post('/super-login', bruteForceCheck(db), (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    const admin = db.prepare('SELECT * FROM super_admin WHERE id = 1').get();
    const hash = hashPassword(password);

    if (!admin || admin.username !== username || admin.pass_hash !== hash) {
      recordLoginAttempt(db, req._bruteForceIp, username, '', false);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    recordLoginAttempt(db, req._bruteForceIp, username, '', true);
    const token = createSession(db, {
      tenantId: '', userId: 0, userType: 'super',
      userName: 'Super Admin', role: 'super',
      ip: req.ip, userAgent: req.headers['user-agent']
    });

    auditLog(req, 'SUPER_LOGIN', 'auth', '', '');
    res.json({ success: true, token, userType: 'super', userName: 'Super Admin' });
  });

  // ── Station Admin Login ──
  router.post('/login', bruteForceCheck(db), (req, res) => {
    const { username, password, tenantId } = req.body;
    if (!username || !password || !tenantId) return res.status(400).json({ error: 'Missing credentials' });

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ? AND active = 1').get(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Station not found or inactive' });
    }

    const hash = hashPassword(password);
    const user = db.prepare(
      'SELECT * FROM admin_users WHERE tenant_id = ? AND username = ? AND pass_hash = ? AND active = 1'
    ).get(tenantId, username, hash);

    if (!user) {
      recordLoginAttempt(db, req._bruteForceIp, username, tenantId, false);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    recordLoginAttempt(db, req._bruteForceIp, username, tenantId, true);
    const token = createSession(db, {
      tenantId, userId: user.id, userType: 'admin',
      userName: user.name, role: user.role,
      ip: req.ip, userAgent: req.headers['user-agent']
    });

    auditLog(req, 'ADMIN_LOGIN', 'auth', user.id, user.name);
    res.json({
      success: true, token, userType: 'admin',
      userName: user.name, userRole: user.role,
      tenantId, tenantName: tenant.name
    });
  });

  // ── Employee Login (PIN-based) ──
  router.post('/employee-login', bruteForceCheck(db), (req, res) => {
    const { pin, tenantId } = req.body;
    if (!pin || !tenantId) return res.status(400).json({ error: 'Missing credentials' });

    const hash = hashPassword(pin);
    const emp = db.prepare(
      'SELECT * FROM employees WHERE tenant_id = ? AND pin_hash = ? AND active = 1'
    ).get(tenantId, hash);

    if (!emp) {
      recordLoginAttempt(db, req._bruteForceIp, 'employee-pin', tenantId, false);
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    recordLoginAttempt(db, req._bruteForceIp, emp.name, tenantId, true);
    const token = createSession(db, {
      tenantId, userId: emp.id, userType: 'employee',
      userName: emp.name, role: 'attendant',
      ip: req.ip, userAgent: req.headers['user-agent']
    });

    res.json({
      success: true, token, userType: 'employee',
      userName: emp.name, employeeId: emp.id, tenantId
    });
  });

  // ── Logout ──
  router.post('/logout', (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (token) {
      destroySession(db, token);
      auditLog(req, 'LOGOUT', 'auth', '', '');
    }
    res.json({ success: true });
  });

  // ── Session check ──
  router.get('/session', (req, res) => {
    if (!req.session) return res.status(401).json({ error: 'No active session' });
    res.json({
      valid: true,
      userType: req.userType,
      userName: req.userName,
      role: req.userRole,
      tenantId: req.tenantId
    });
  });

  // ── Change super admin credentials ──
  router.post('/super-change-password', requireRole('super'), (req, res) => {
    const { newUsername, newPassword, confirmPassword } = req.body;
    if (!newUsername || newUsername.length < 3) return res.status(400).json({ error: 'Username too short' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });
    if (newPassword !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });

    db.prepare('UPDATE super_admin SET username = ?, pass_hash = ?, updated_at = datetime("now") WHERE id = 1')
      .run(newUsername, hashPassword(newPassword));

    auditLog(req, 'SUPER_PASSWORD_CHANGE', 'auth', '', '');
    res.json({ success: true });
  });

  // ── Change admin password ──
  router.post('/change-password', requireRole('admin'), (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });

    db.prepare('UPDATE admin_users SET pass_hash = ? WHERE id = ? AND tenant_id = ?')
      .run(hashPassword(newPassword), req.userId, req.tenantId);

    auditLog(req, 'PASSWORD_CHANGE', 'auth', req.userId, '');
    res.json({ success: true });
  });

  return router;
}

module.exports = authRoutes;
