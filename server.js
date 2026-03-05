/**
 * FuelBunk Pro — Express Server
 * SQLite backend with security middleware
 *
 * Deploy: Railway, Render, Fly.io, or any Node.js host with persistent disk
 * Run:    npm start (or npm run dev for watch mode)
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initDatabase } = require('./db/schema');
const { authMiddleware, inputSanitizerMiddleware, auditMiddleware } = require('./middleware/security');
const authRoutes = require('./api/auth');
const dataRoutes = require('./api/data');

// ═══════════════════════════════════════════
// INITIALIZE (async for sql.js)
// ═══════════════════════════════════════════
async function startServer() {
  const db = await initDatabase();
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Store db reference for middleware access
  app.locals.db = db;

// ═══════════════════════════════════════════
// SECURITY MIDDLEWARE
// ═══════════════════════════════════════════

// SECURITY: HTTP security headers (relaxed CSP for inline frontend)
app.use(helmet({
  contentSecurityPolicy: false, // Frontend uses inline scripts — CSP handled via _headers in production
  crossOriginEmbedderPolicy: false
}));

// SECURITY: CORS — restrict origins in production
app.use(cors({
  origin: process.env.CORS_ORIGIN || true, // Set to your domain in production
  credentials: true
}));

// SECURITY: Global rate limiting
app.use(rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200,                  // 200 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' }
}));

// SECURITY: Stricter rate limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 20,                    // 20 login attempts per 5 min
  message: { error: 'Too many login attempts' }
});

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// SECURITY: Input sanitization on all requests
app.use(inputSanitizerMiddleware);

// SECURITY: Audit trail for write operations
app.use(auditMiddleware);

// Trust proxy (for correct IP behind reverse proxy)
app.set('trust proxy', 1);

// ═══════════════════════════════════════════
// STATIC FILES — serve frontend
// ═══════════════════════════════════════════
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  setHeaders: (res, filePath) => {
    // SECURITY: No-cache for HTML
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ═══════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0-alpha',
    database: 'sqlite',
    uptime: process.uptime()
  });
});

// Auth routes (login has its own rate limiter + brute force check)
app.use('/api/auth', authLimiter, authRoutes(db));

// Data routes (requires auth except tenant listing)
app.use('/api/data', authMiddleware(db), dataRoutes(db));

// Tenant list (public — needed before login)
app.get('/api/tenants/list', (req, res) => {
  const tenants = db.prepare(
    'SELECT id, name, location, icon, color, color_light, active, station_code FROM tenants ORDER BY name'
  ).all();
  res.json(tenants);
});

// ═══════════════════════════════════════════
// SPA FALLBACK
// ═══════════════════════════════════════════
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  // SECURITY: Never expose internal errors
  res.status(500).json({ error: 'Internal server error' });
});

// ═══════════════════════════════════════════
// START
// ═══════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║  FuelBunk Pro — Server Running           ║
  ║  Port: ${PORT}                              ║
  ║  Database: SQLite (file-based)           ║
  ║  URL: http://localhost:${PORT}              ║
  ╚══════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  function shutdown() {
    console.log('[Server] Shutting down...');
    db.close();
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(e => {
  console.error('[FATAL] Failed to start server:', e.message || e);
  console.error(e.stack || '');
  process.exit(1);
});
