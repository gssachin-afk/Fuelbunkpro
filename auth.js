/**
 * FuelBunk Pro — Auth Routes (PostgreSQL async)
 */
const express = require('express');
const { hashPassword } = require('./schema');
const { bruteForceCheck, recordLoginAttempt, createSession, destroySession, auditLog, requireRole } = require('./security');

function authRoutes(db) {
  const router = express.Router();

  router.post('/super-login', bruteForceCheck(db), async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    try {
      const admin = await db.prepare('SELECT * FROM super_admin WHERE id = 1').get();
      const hash = hashPassword(password);
      if (!admin || admin.username !== username || admin.pass_hash !== hash) {
        await recordLoginAttempt(db, req._bruteForceIp, username, '', false);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      await recordLoginAttempt(db, req._bruteForceIp, username, '', true);
      const token = await createSession(db, { tenantId:'', userId:0, userType:'super', userName:'Super Admin', role:'super', ip:req.ip, userAgent:req.headers['user-agent'] });
      res.json({ success: true, token, userType: 'super', userName: 'Super Admin' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/login', bruteForceCheck(db), async (req, res) => {
    const { username, password, tenantId } = req.body;
    if (!username || !password || !tenantId) return res.status(400).json({ error: 'Missing credentials' });
    try {
      const tenant = await db.prepare('SELECT * FROM tenants WHERE id = $1 AND active = 1').get(tenantId);
      if (!tenant) return res.status(404).json({ error: 'Station not found or inactive' });
      const hash = hashPassword(password);
      const user = await db.prepare('SELECT * FROM admin_users WHERE tenant_id = $1 AND username = $2 AND pass_hash = $3 AND active = 1').get(tenantId, username, hash);
      if (!user) {
        await recordLoginAttempt(db, req._bruteForceIp, username, tenantId, false);
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      await recordLoginAttempt(db, req._bruteForceIp, username, tenantId, true);
      const token = await createSession(db, { tenantId, userId:user.id, userType:'admin', userName:user.name, role:user.role, ip:req.ip, userAgent:req.headers['user-agent'] });
      res.json({ success:true, token, userType:'admin', userName:user.name, userRole:user.role, tenantId, tenantName:tenant.name });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/employee-login', bruteForceCheck(db), async (req, res) => {
    const { pin, tenantId } = req.body;
    if (!pin || !tenantId) return res.status(400).json({ error: 'Missing credentials' });
    try {
      const hash = hashPassword(pin);
      const emp = await db.prepare('SELECT * FROM employees WHERE tenant_id = $1 AND pin_hash = $2 AND active = 1').get(tenantId, hash);
      if (!emp) {
        await recordLoginAttempt(db, req._bruteForceIp, 'employee-pin', tenantId, false);
        return res.status(401).json({ error: 'Invalid PIN' });
      }
      await recordLoginAttempt(db, req._bruteForceIp, emp.name, tenantId, true);
      const token = await createSession(db, { tenantId, userId:emp.id, userType:'employee', userName:emp.name, role:'attendant', ip:req.ip, userAgent:req.headers['user-agent'] });
      res.json({ success:true, token, userType:'employee', userName:emp.name, employeeId:emp.id, tenantId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/logout', async (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (token) { await destroySession(db, token); await auditLog(req, 'LOGOUT', 'auth', '', ''); }
    res.json({ success: true });
  });

  router.get('/session', (req, res) => {
    if (!req.session) return res.status(401).json({ error: 'No active session' });
    res.json({ valid:true, userType:req.userType, userName:req.userName, role:req.userRole, tenantId:req.tenantId });
  });

  router.post('/super-change-password', requireRole('super'), async (req, res) => {
    const { newUsername, newPassword, confirmPassword } = req.body;
    if (!newUsername || newUsername.length < 3) return res.status(400).json({ error: 'Username too short' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });
    if (newPassword !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' });
    try {
      await db.prepare('UPDATE super_admin SET username = $1, pass_hash = $2, updated_at = NOW() WHERE id = 1').run(newUsername, hashPassword(newPassword));
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/change-password', requireRole('admin'), async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });
    try {
      await db.prepare('UPDATE admin_users SET pass_hash = $1 WHERE id = $2 AND tenant_id = $3').run(hashPassword(newPassword), req.userId, req.tenantId);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = authRoutes;
