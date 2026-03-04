/**
 * FuelBunk Pro — Security Middleware
 * Rate limiting, authentication, input sanitization, audit logging
 */
const crypto = require('crypto');

// ═══════════════════════════════════════════
// INPUT SANITIZER
// ═══════════════════════════════════════════
const SQL_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b\s+(INTO|FROM|TABLE|SET|ALL|VALUES|DATABASE)\b)/gi,
  /(--|\/\*|\*\/)/g,
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/gi,
  /('\s*(OR|AND|UNION|SELECT|DROP)\b)/gi,
  /(;\s*(DROP|DELETE|INSERT|UPDATE|SELECT|EXEC)\b)/gi,
  /(SLEEP\s*\(|BENCHMARK\s*\(|WAITFOR\s+DELAY)/gi
];

function detectThreats(str) {
  if (typeof str !== 'string') return [];
  const threats = [];
  SQL_PATTERNS.forEach(p => { if (p.test(str)) threats.push('SQL_INJECTION'); p.lastIndex = 0; });
  if (/<script|javascript:|on\w+\s*=/i.test(str)) threats.push('XSS');
  if (/\$(?:gt|gte|lt|lte|ne|eq|regex|where)/i.test(str)) threats.push('NOSQL_INJECTION');
  return [...new Set(threats)];
}

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

// Middleware: sanitize all request bodies
function inputSanitizerMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    // Check for injection threats in all string values
    const allStrings = JSON.stringify(req.body);
    const threats = detectThreats(allStrings);
    if (threats.length > 0) {
      // Log the attempt
      auditLog(req, 'INJECTION_ATTEMPT', 'security', '', threats.join(','));
      return res.status(400).json({ error: 'Invalid input detected' });
    }
    req.body = sanitizeObject(req.body);
  }
  next();
}

// ═══════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════
function authMiddleware(db) {
  return (req, res, next) => {
    // Skip auth for login/public routes
    const publicPaths = ['/api/auth/login', '/api/auth/super-login', '/api/tenants/list', '/api/health'];
    if (publicPaths.some(p => req.path.startsWith(p))) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const session = db.prepare(
      "SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')"
    ).get(token);

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Attach session info to request
    req.session = session;
    req.tenantId = session.tenant_id;
    req.userId = session.user_id;
    req.userType = session.user_type;
    req.userName = session.user_name;
    req.userRole = session.role;
    next();
  };
}

// Role check middleware
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.userType) return res.status(401).json({ error: 'Not authenticated' });
    if (roles.includes('super') && req.userType === 'super') return next();
    if (roles.includes(req.userType)) return next();
    if (roles.includes(req.userRole)) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

// ═══════════════════════════════════════════
// BRUTE FORCE PROTECTION
// ═══════════════════════════════════════════
function bruteForceCheck(db) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const windowMinutes = 5;
    const maxAttempts = 10;
    const lockoutMinutes = 15;

    // Count recent failed attempts from this IP
    const count = db.prepare(`
      SELECT COUNT(*) as cnt FROM login_attempts
      WHERE ip_address = ? AND success = 0
      AND attempted_at > datetime('now', ?)
    `).get(ip, `-${windowMinutes} minutes`);

    if (count && count.cnt >= maxAttempts) {
      // Check if lockout has expired
      const latest = db.prepare(`
        SELECT attempted_at FROM login_attempts
        WHERE ip_address = ? AND success = 0
        ORDER BY attempted_at DESC LIMIT 1
      `).get(ip);

      return res.status(429).json({
        error: 'Too many login attempts',
        retryAfter: lockoutMinutes * 60,
        message: `Account locked. Try again in ${lockoutMinutes} minutes.`
      });
    }

    req._bruteForceIp = ip;
    next();
  };
}

function recordLoginAttempt(db, ip, username, tenantId, success) {
  db.prepare(`
    INSERT INTO login_attempts (ip_address, username, tenant_id, success)
    VALUES (?, ?, ?, ?)
  `).run(ip, username || '', tenantId || '', success ? 1 : 0);

  // Clean old attempts (keep last 24 hours)
  db.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-24 hours')").run();
}

// ═══════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════
function auditLog(req, action, entity = '', entityId = '', details = '') {
  try {
    const db = req.app?.locals?.db;
    if (!db) return;
    db.prepare(`
      INSERT INTO audit_log (tenant_id, user_name, user_type, action, entity, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.tenantId || '',
      req.userName || '',
      req.userType || '',
      action,
      entity,
      String(entityId),
      typeof details === 'object' ? JSON.stringify(details) : String(details),
      req.ip || ''
    );
  } catch (e) {
    console.error('[Audit] Failed to log:', e.message);
  }
}

// Middleware: auto-audit write operations
function auditMiddleware(req, res, next) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entity = req.path.split('/').filter(Boolean).pop() || 'unknown';
        auditLog(req, `${req.method} ${req.path}`, entity, body?.id || '', '');
      }
      return originalJson(body);
    };
  }
  next();
}

// ═══════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════
function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

function createSession(db, { tenantId, userId, userType, userName, role, ip, userAgent }) {
  const token = generateToken();
  const hours = userType === 'super' ? 4 : 12;
  db.prepare(`
    INSERT INTO sessions (token, tenant_id, user_id, user_type, user_name, role, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), ?, ?)
  `).run(token, tenantId || '', userId || 0, userType, userName || '', role || '', `+${hours} hours`, ip || '', userAgent || '');

  // Clean expired sessions
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  return token;
}

function destroySession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

module.exports = {
  inputSanitizerMiddleware,
  authMiddleware,
  requireRole,
  bruteForceCheck,
  recordLoginAttempt,
  auditLog,
  auditMiddleware,
  generateToken,
  createSession,
  destroySession,
  sanitizeString,
  sanitizeObject,
  detectThreats
};
