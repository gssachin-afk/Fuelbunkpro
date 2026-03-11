# FuelBunk Pro — Deployment Guide

## Quick Start (Local Development)

```bash
npm install
npm run dev
# Server starts at http://localhost:3000
```

## Project Structure

```text
.
├── .github/
├── railway.json
├── deploy/
│   ├── Dockerfile
│   └── railway.json
├── src/
│   ├── backend/
│   │   ├── server.js
│   │   ├── auth.js
│   │   ├── security.js
│   │   ├── data.js
│   │   └── schema.js
│   └── frontend/
│       ├── index.html
│       ├── api-client.js
│       └── bridge.js
├── package.json
└── README.md
```

## Deployment Options

### Option 1: Railway (Recommended for POC)
1. Push code to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add a PostgreSQL service in the same Railway project
4. Ensure `DATABASE_URL` is available to the app service
5. Keep root [railway.json](railway.json) in sync with [deploy/railway.json](deploy/railway.json)
6. Railway runs `npm start`

### Option 2: Render
1. Push to GitHub
2. render.com → New Web Service → Connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add a PostgreSQL database (Render Postgres or external)
6. Set `DATABASE_URL` on the web service

### Option 3: Fly.io
```bash
# Install flyctl
fly launch
# Provision Postgres and attach to app (or set external DATABASE_URL)
fly postgres create
fly postgres attach --app <your-app-name>
fly deploy
```

### Option 4: Docker (Any VPS)
```bash
docker build -f deploy/Dockerfile -t fuelbunk-pro .
docker run -d -p 3000:3000 -e DATABASE_URL="postgres://user:pass@host:5432/dbname" fuelbunk-pro
```

## Environment Variables

| Variable      | Default              | Description                    |
|--------------|----------------------|--------------------------------|
| PORT         | 3000                 | Server port                    |
| DATABASE_URL | (required or use PG*)| PostgreSQL connection URL      |
| PGHOST       | unset                | PostgreSQL host (if not using DATABASE_URL) |
| PGPORT       | 5432                 | PostgreSQL port                |
| PGDATABASE   | unset                | PostgreSQL database name       |
| PGUSER       | unset                | PostgreSQL username            |
| PGPASSWORD   | unset                | PostgreSQL password            |
| CORS_ORIGIN  | * (all)              | Allowed CORS origins           |
| NODE_ENV     | development          | Set to 'production' in prod    |

## Default Credentials

| Role         | Username     | Password              |
|-------------|-------------|------------------------|
| Super Admin | superadmin  | FuelBunk@Super2026     |

**Change these immediately after first login!**

## Database

- **Type**: PostgreSQL
- **Connection**: `DATABASE_URL` or `PG*` env vars
- **Schema Init**: Auto-created on startup by [src/backend/schema.js](src/backend/schema.js)
- **Multi-tenant Safety**: tenant-scoped queries are filtered by `tenant_id`

## API Endpoints

### Auth
- `POST /api/auth/super-login` — Super admin login
- `POST /api/auth/login` — Station admin login
- `POST /api/auth/employee-login` — Employee PIN login
- `POST /api/auth/logout` — Destroy session
- `GET  /api/auth/session` — Check session validity

### Tenants
- `GET  /api/tenants/list` — List all stations (public)
- `POST /api/data/tenants` — Create station (super)
- `PUT  /api/data/tenants/:id` — Update station (super)
- `DELETE /api/data/tenants/:id` — Delete station (super)

### Data (requires auth, tenant-scoped)
- `GET    /api/data/:store` — Get all records
- `GET    /api/data/:store/:id` — Get by ID
- `POST   /api/data/:store` — Create (auto-ID)
- `PUT    /api/data/:store` — Upsert
- `PUT    /api/data/:store/bulk` — Bulk upsert
- `DELETE /api/data/:store/:id` — Delete by ID
- `DELETE /api/data/:store` — Clear all (admin only)
- `GET    /api/data/:store/by-index/:col/:val` — Query by index

### Stores: sales, tanks, pumps, dipReadings, expenses, fuelPurchases, creditCustomers, creditTransactions, employees, shifts, settings, auditLog
