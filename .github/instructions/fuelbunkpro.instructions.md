---
description: 'Backend-only guidance for FuelBunk Pro Express + PostgreSQL changes. Use when editing API, auth, security, schema, or data-access files.'
applyTo: 'src/backend/{server.js,auth.js,security.js,data.js,schema.js}'
---

# FuelBunk Pro Backend Instructions

## Scope
- Applies to backend runtime and API files only.
- Use workspace-wide guidance in [.github/copilot-instructions.md](../copilot-instructions.md) as the baseline.

## Backend Safety Rules
- Enforce tenant isolation on tenant-scoped operations using req.tenantId.
- Use parameterized SQL only. Never concatenate user-controlled values into SQL.
- Keep route compatibility for both /api/data/* and /api/* consumers.
- Preserve db wrapper compatibility patterns (prepare().run/get/all) unless doing a coordinated refactor.
- Keep auth/session behavior compatible with sessions table logic and existing middleware flows.

## Data and API Conventions
- Keep API payload fields camelCase at route boundaries.
- Keep SQL columns snake_case and follow existing mapping helpers.
- Preserve current JSON response shape for existing endpoints unless migration steps are included.
- Prefer paginated list endpoints instead of returning full datasets from high-growth tables.

## Edit Checklist
- Verify role checks still use existing helpers from [security.js](../../src/backend/security.js).
- Verify new or changed queries include tenant filter and an index strategy when needed.
- For risky changes, include a manual API smoke-test plan because there is no test script.
- If env assumptions, startup behavior, or API usage change, update [README.md](../../README.md).