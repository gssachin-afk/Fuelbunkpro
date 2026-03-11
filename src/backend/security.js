/**
 * FuelBunk Pro — Security Middleware (PostgreSQL async version)
 */
const crypto = require('crypto');

function sanitizeString(str, maxLen = 1000) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').replace(/\0/g, '').trim().substring(0, maxLen);
}

function sanitizeObject(obj, depth = 0) {
  if (depth > 5) return {};
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj === 'number') return isFinite(obj) ? obj : 0;
  if (typeof obj === 'boolean') return obj;
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(v => sanitizeObject(v, depth + 1));
  if (typeof obj === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      clean[sanitizeString(k, 100)] = sanitizeObject(v, depth + 1);
    }
    return clean;
  }
  return null;
}

function inputSanitizerMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = sanitizeObject(req.body);
  next();
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authMiddleware(db) {
  return async (req, res, next) => {
    const publicPaths = ['/api/auth/login', '/api/auth/super-login', '/api/health'];
    if (publicPaths.some(p => req.path.startsWith(p))) return next();
    if (req.path === '/api/tenants' && req.method === 'GET') return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    try {
      const session = await db.prepare(
        "SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()"
      ).get(token);

      if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

      req.session = session;
      req.tenantId = session.tenant_id;
      req.userId = session.user_id;
      req.userType = session.user_type;
      req.userName = session.user_name;
      req.userRole = session.role;
      next();
    } catch (e) {
      console.error('[Auth]', e.message);
      return res.status(500).json({ error: 'Auth error' });
    }
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.userType) return res.status(401).json({ error: 'Not authenticated' });
    if (roles.includes('super') && req.userType === 'super') return next();
    if (roles.includes(req.userType)) return next();
    if (roles.includes(req.userRole)) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

function bruteForceCheck(db) {
  return async (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    try {
      const result = await db.prepare(
        "SELECT COUNT(*) as cnt FROM login_attempts WHERE ip_address = $1 AND success = 0 AND attempted_at > NOW() - INTERVAL '5 minutes'"
      ).get(ip);
      if (result && parseInt(result.cnt) >= 10) {
        return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
      }
    } catch (e) {}
    req._bruteForceIp = ip;
    next();
  };
}

async function recordLoginAttempt(db, ip, username, tenantId, success) {
  try {
    await db.prepare('INSERT INTO login_attempts (ip_address, username, tenant_id, success) VALUES ($1, $2, $3, $4)')
      .run(ip || '', username || '', tenantId || '', success ? 1 : 0);
  } catch (e) {}
}

async function auditLog(req, action, entity = '', entityId = '', details = '') {
  try {
    const db = req.app?.locals?.db;
    if (!db) return;
    await db.prepare('INSERT INTO audit_log (tenant_id, user_name, user_type, action, entity, entity_id, details, ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)')
      .run(req.tenantId||'', req.userName||'', req.userType||'', action, entity, String(entityId||''), String(details||''), req.ip||'');
  } catch (e) {}
}

async function createSession(db, { tenantId, userId, userType, userName, role, ip, userAgent }) {
  const token = generateToken();
  const hours = userType === 'super' ? 4 : 12;
  await db.prepare(
    `INSERT INTO sessions (token, tenant_id, user_id, user_type, user_name, role, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '${hours} hours', $7, $8)`
  ).run(token, tenantId||'', userId||0, userType, userName||'', role||'', ip||'', userAgent||'');
  try { await db.prepare("DELETE FROM sessions WHERE expires_at < NOW()").run(); } catch {}
  return token;
}

async function destroySession(db, token) {
  try { await db.prepare('DELETE FROM sessions WHERE token = $1').run(token); } catch {}
}

module.exports = {
  inputSanitizerMiddleware, authMiddleware, requireRole,
  bruteForceCheck, recordLoginAttempt, auditLog,
  generateToken, createSession, destroySession,
  sanitizeString, sanitizeObject,
};
