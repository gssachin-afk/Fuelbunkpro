---
name: scalable-database
description: 'Design and implement scalable PostgreSQL changes for FuelBunk Pro. Use for query optimization, indexing, pagination, tenant isolation safety, schema updates, and performance tuning in JavaScript Express APIs.'
argument-hint: 'Describe the endpoint or table, traffic pattern, and the performance or scalability goal.'
---

# Scalable Database Workflow for FuelBunk Pro

## When to Use
- Slow data endpoints in [data.js](../../../src/backend/data.js), [auth.js](../../../src/backend/auth.js), or [security.js](../../../src/backend/security.js)
- New schema, column, or index work in [schema.js](../../../src/backend/schema.js)
- Rising tenant data volume causing large payloads or full scans
- Need for pagination, retention, or safer high-throughput write paths

## Non-Negotiable Constraints
- Keep strict tenant isolation for tenant-scoped data.
- Use parameterized SQL only.
- Keep existing response contracts backward compatible unless migration work is explicitly requested.
- Preserve db wrapper compatibility patterns already used by routes.

## Procedure
1. Define workload and success criteria.
Capture endpoint, table size, expected throughput, and target latency.

2. Locate read and write paths.
Trace request flow through [server.js](../../../src/backend/server.js), route handler files, and [schema.js](../../../src/backend/schema.js).

3. Confirm tenant safety first.
Ensure every tenant-scoped query includes tenant_id filtering and role checks are still enforced.

4. Remove unbounded reads.
For list endpoints, add deterministic ordering and pagination parameters with safe defaults.

5. Add or adjust indexes.
For new access patterns, add matching indexes in schema initialization and verify index alignment with filters and sort columns.

6. Keep SQL and wrapper compatibility.
Retain current placeholder style and asynchronous query usage so existing prepare().run/get/all flows continue to work.

7. Validate behavior and performance.
Run local API smoke checks, verify tenant isolation, and compare before versus after response behavior and latency.

8. Update project docs when behavior changes.
If API contract, env usage, or startup assumptions change, update [README.md](../../../README.md).

## Performance Checklist
- No full dataset reads where pagination is required.
- No new query without an index plan for production cardinality.
- No cross-tenant data exposure paths.
- No duplicate security logic when existing middleware can be reused.
- No breaking changes to both /api/data/* and /api/* consumers.

## Common Pitfalls
- Adding filters without adding corresponding indexes.
- Building SQL with interpolated input values.
- Returning all rows by default from high-growth tables.
- Changing key semantics for composite-key tables without coordinated data migration.

## References
- [schema.js](../../../src/backend/schema.js)
- [data.js](../../../src/backend/data.js)
- [security.js](../../../src/backend/security.js)
- [auth.js](../../../src/backend/auth.js)
- [server.js](../../../src/backend/server.js)
- [README.md](../../../README.md)