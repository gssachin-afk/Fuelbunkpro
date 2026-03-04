# FuelBunk Pro — Deployment Guide

## Quick Start (Local Development)

```bash
cd fuelbunk-server
npm install
npm run dev
# Server starts at http://localhost:3000
```

## Deployment Options (with Persistent Disk for SQLite)

### Option 1: Railway (Recommended for POC)
1. Push code to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add a volume mount:
   - Mount path: `/app/data`
   - Set env: `DB_DIR=/app/data`
4. Railway auto-detects Node.js and runs `npm start`
5. Your app is live with persistent SQLite

### Option 2: Render
1. Push to GitHub
2. render.com → New Web Service → Connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add a disk:
   - Mount path: `/data`
   - Set env: `DB_DIR=/data`

### Option 3: Fly.io
```bash
# Install flyctl
fly launch
fly volumes create fuelbunk_data --size 1
# Edit fly.toml to mount volume at /data
fly deploy
```

### Option 4: Docker (Any VPS)
```bash
docker build -t fuelbunk-pro .
docker run -d -p 3000:3000 -v fuelbunk_data:/app/data fuelbunk-pro
```

## Environment Variables

| Variable      | Default              | Description                    |
|--------------|----------------------|--------------------------------|
| PORT         | 3000                 | Server port                    |
| DB_DIR       | ./data               | SQLite database directory      |
| CORS_ORIGIN  | * (all)              | Allowed CORS origins           |
| NODE_ENV     | development          | Set to 'production' in prod    |

## Default Credentials

| Role         | Username     | Password              |
|-------------|-------------|------------------------|
| Super Admin | superadmin  | FuelBunk@Super2026     |

**Change these immediately after first login!**

## Database

- **Type**: SQLite (file-based, via better-sqlite3)
- **Location**: `$DB_DIR/fuelbunk.db`
- **Backup**: Simply copy the `.db` file
- **WAL Mode**: Enabled for better read concurrency

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
