# FuelBunk Pro Project Guidelines

## Stack and Runtime
- JavaScript on Node.js using CommonJS modules.
- Express 4 API server with PostgreSQL via pg.
- Keep changes compatible with the existing runtime style unless a migration is explicitly requested.

## Architecture Boundaries
- Server entry, middleware order, static hosting, and route wiring: [server.js](../src/backend/server.js)
- Authentication routes and login flows: [auth.js](../src/backend/auth.js)
- Session, auth checks, request sanitization, and audit helpers: [security.js](../src/backend/security.js)
- Tenant-scoped data APIs and store mapping: [data.js](../src/backend/data.js)
- Database schema setup and SQL wrapper compatibility layer: [schema.js](../src/backend/schema.js)
- Frontend API bridge compatibility: [api-client.js](../src/frontend/api-client.js) and [bridge.js](../src/frontend/bridge.js)

## Build and Run
- Install dependencies: npm install
- Local development: npm run dev
- Production run: npm start
- There is no automated test script today. For risky changes, include a clear validation plan with API smoke checks.

## Database and Scalability Rules
- Preserve tenant isolation. Every tenant-scoped query must filter by tenant_id = req.tenantId.
- Use parameterized SQL. Never concatenate user input into SQL strings.
- Prefer paginated list endpoints over unbounded full-table reads.
- Add indexes for new high-read filters and joins in the schema initialization path.
- Keep compatibility with the existing db.prepare().run/get/all usage unless doing a full coordinated refactor.
- Preserve both route styles used by clients: /api/data/* and /api/*.
- Keep API response shape backward compatible unless migration steps are included in the same change.

## Coding Conventions
- Use async/await and small route handlers that return consistent JSON error shapes.
- Keep camelCase payload fields at API boundaries and snake_case in SQL columns, following existing mapping helpers.
- Reuse existing security helpers (authMiddleware, requireRole, bruteForceCheck, auditLog) instead of duplicating logic.
- Keep session-based auth behavior backed by the sessions table unless a migration is explicitly requested.

## Deployment and Config
- Database connection is driven by DATABASE_URL or PGHOST-based variables in [schema.js](../src/backend/schema.js).
- If startup, env handling, or storage assumptions change, update [README.md](../README.md) in the same change.
