/**
 * FuelBunk Pro — Express Server (PostgreSQL)
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initDatabase } = require('./schema');
const { authMiddleware, inputSanitizerMiddleware } = require('./security');
const authRoutes = require('./auth');
const dataRoutes = require('./data');

async function startServer() {
  const db = await initDatabase();
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.locals.db = db;
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
  app.use(rateLimit({ windowMs: 60000, max: 300, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(inputSanitizerMiddleware);

  // Serve frontend — index.html is in root directory
  const publicDir = require('fs').existsSync(path.join(__dirname, 'public'))
    ? path.join(__dirname, 'public')
    : __dirname;

  app.use(express.static(publicDir, {
    maxAge: 0,
    setHeaders: (res, fp) => {
      if (fp.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'postgresql', uptime: process.uptime() });
  });

  // Public: station list — needed before login so selector screen works without a token
  app.get('/api/tenants/list', async (req, res) => {
    try {
      const tenants = await db.prepare(
        'SELECT id, name, location, icon, color, color_light, active, station_code FROM tenants ORDER BY name'
      ).all();
      res.json(tenants);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  const authLimiter = rateLimit({ windowMs: 300000, max: 30 });
  app.use('/api/auth', authLimiter, authRoutes(db));
  app.use('/api', authMiddleware(db), dataRoutes(db));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use((err, req, res, next) => {
    console.error('[Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FuelBunk Pro] Running on port ${PORT} with PostgreSQL`);
  });

  process.on('SIGTERM', () => { console.log('[Server] Shutting down...'); process.exit(0); });
  process.on('SIGINT', () => process.exit(0));
}

startServer().catch(e => {
  console.error('[FATAL]', e);
  process.exit(1);
});
