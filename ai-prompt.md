# FuelBunk Pro Project Bootstrap Prompt

Use this prompt to generate the FuelBunk Pro repository from scratch.

## Prompt

Create a production-ready FuelBunk Pro project using JavaScript (CommonJS) on Node.js with Express and PostgreSQL.

### Core stack
- Node.js + Express 4
- PostgreSQL via `pg`
- CommonJS modules (`require`/`module.exports`)
- Session/token auth backed by a `sessions` table

### Required structure
- `src/backend/server.js`
- `src/backend/auth.js`
- `src/backend/security.js`
- `src/backend/data.js`
- `src/backend/schema.js`
- `src/frontend/index.html`
- `src/frontend/api-client.js`
- `src/frontend/bridge.js`
- `deploy/Dockerfile`
- `deploy/railway.json`
- `railway.json` (root compatibility file)
- `README.md`
- `package.json`

### Backend requirements
1. Build an Express server in `src/backend/server.js` that:
	- Uses `helmet`, `cors`, `express-rate-limit`, JSON body parsing, and request sanitization middleware.
	- Serves static frontend files from `src/frontend`.
	- Exposes `/api/health`.
	- Mounts auth routes under `/api/auth`.
	- Keeps compatibility for both route styles:
	  - `/api/data/*`
	  - `/api/*`
2. Build auth routes in `src/backend/auth.js`:
	- Super admin login
	- Tenant admin login
	- Employee login
	- Logout + session check
	- Password change routes
3. Build security helpers in `src/backend/security.js`:
	- `authMiddleware`
	- `requireRole`
	- brute-force protection (`bruteForceCheck`, `recordLoginAttempt`)
	- request sanitization
	- session create/destroy helpers
	- audit logging helper
4. Build data API in `src/backend/data.js`:
	- Tenant CRUD and tenant admin management endpoints
	- Generic store endpoints (`GET`, `POST`, `PUT`, `DELETE`, bulk)
	- Settings endpoints
	- Preserve camelCase payload compatibility while mapping SQL snake_case columns
5. Build schema/init in `src/backend/schema.js`:
	- Connect with `DATABASE_URL` or PGHOST-based variables
	- Create all required tables on startup
	- Seed super admin if missing
	- Provide a compatibility wrapper supporting `db.prepare().run/get/all`

### Data safety and scalability rules
- Enforce tenant isolation on all tenant-scoped queries using tenant filtering.
- Use parameterized SQL only. Never build SQL with user input concatenation.
- Keep API response shapes backward compatible.
- Prefer paginated patterns for high-growth list endpoints.
- Add indexes when introducing high-read filters or joins.

### Frontend bridge requirements
- `src/frontend/api-client.js` should provide a REST-backed FuelDB-compatible interface.
- `src/frontend/bridge.js` should patch existing frontend hooks so legacy UI flows continue to work.
- Keep compatibility behavior that supports old frontend expectations.

### Deployment requirements
- `package.json` scripts:
  - `start`: `node src/backend/server.js`
  - `dev`: `node --watch src/backend/server.js`
- `deploy/Dockerfile` should run `npm start`.
- `deploy/railway.json` and root `railway.json` should both use `npm start`.
- README must describe PostgreSQL deployment (no SQLite/DB_DIR guidance).

### README requirements
Document:
- Local setup (`npm install`, `npm run dev`)
- Project structure
- Environment variables (`DATABASE_URL` and PG* variables)
- Deployment options (Railway, Render, Fly, Docker)
- API compatibility note for `/api/data/*` and `/api/*`

### Quality bar
- Keep route handlers async/await based and concise.
- Return consistent JSON error shapes.
- Preserve compatibility unless migration steps are explicitly included.
