# FuelBunk Pro Requirements

## Document Purpose
This document extracts and normalizes requirements from projecct-requirements.pdf into a Copilot-friendly format.

## Copilot Requirement Standard Used
Each requirement in this document is:
- Uniquely identified.
- Atomic (one behavior per requirement).
- Testable with explicit acceptance criteria.
- Tagged by type (Functional, Non-Functional, Security, Operations, QA).
- Traceable to source notes.

## Source Scope
- PDF pages reviewed: 1 to 12.
- Includes user requirements, system requirements, GUI review findings, security notes, deployment notes, and scale recommendations.

## Functional Requirements

| ID | Priority | Requirement | Acceptance Criteria | Source |
|---|---|---|---|---|
| FR-001 | High | Employees must record sales data in the system. | Employee can submit sale entries tied to shift context. | P1 |
| FR-002 | High | Sales entry must occur at end of shift workflow. | Closing flow supports end-of-shift sale finalization. | P1, P4 |
| FR-003 | High | An employee can submit shift sale data only once per day. | Duplicate end-of-shift submissions for same employee and day are blocked. | P1 |
| FR-004 | High | Manager must view sales trends per employee. | Dashboard/report filters by employee and period with trend outputs. | P1 |
| FR-005 | High | Employee login should capture attendance only during valid station login context. | Successful employee login creates attendance record with timestamp and station context. | P3, P4 |
| FR-006 | High | Opening and closing meter readings must be captured per shift handover. | Employee enters opening/closing readings; manager closure flow confirms handover. | P4 |
| FR-007 | High | Shift status must show which employees are live per shift. | Dashboard displays active employees grouped by shift in near real time. | P4 |
| FR-008 | High | Staff directory updates must reflect everywhere employee names appear. | Edited employee name is immediately visible in login dropdowns, allocation, and reports. | P3 |
| FR-009 | High | Permission editor must show both granted and ungranted permissions. | Existing permissions render as checked; changes persist and reflect in employee portal behavior. | P3 |
| FR-010 | High | Pump/nozzle fuel mapping changes must propagate to allocation and entry flows. | Changing nozzle fuel type updates Staff and Allocation and employee sales forms. | P3, P4 |
| FR-011 | Medium | Employee shift assignment must support multiple shifts per day. | Shift editor supports multi-select and persists all selected shifts. | P3 |
| FR-012 | Medium | Changing an employee shift must de-allocate previously assigned nozzles. | Existing nozzle allocations are cleared and manager must reassign. | P3 |
| FR-013 | High | Employee portal must only show assigned fuel/pump context. | Employee sales screen shows only assigned fuel type and pump/nozzle. | P4 |
| FR-014 | High | Employee portal overview must display all payment modes. | Cash, card, UPI, and credit are visible and updated correctly. | P4 |
| FR-015 | High | Credit transactions must enforce customer credit limits. | Entry above configured credit limit is rejected with user-visible validation message. | P4 |
| FR-016 | High | Previous closing reading should become next opening reading and be non-editable. | Opening reading auto-populates from prior close and cannot be edited by employee. | P5 |
| FR-017 | High | Closing readings should be locked after submission. | Submitted closing reading cannot be modified without authorized correction flow. | P5 |
| FR-018 | High | Admin sales log should include actual pump and nozzle columns. | Sales records display populated pump and nozzle values in admin views and reports. | P5 |
| FR-019 | High | Sales, meter readings, and tank inventory must stay linked. | Updating sales/closing readings updates corresponding pump and tank inventory aggregates. | P4, P5 |
| FR-020 | Medium | Expense description should sanitize junk values. | Description field strips invalid/junk characters and preserves valid text. | P4 |
| FR-021 | High | Employee login details should be available in daily reporting. | Daily report includes who logged in, when, and shift association. | P4 |
| FR-022 | High | Employee shift report must show shifts done and frequency by employee for a month. | Monthly report includes per-employee shift counts and attendance entries. | P3, P4 |
| FR-023 | High | Full DSR report generation must work from reports module. | Full DSR export/view completes without failure for valid date range. | P5 |
| FR-024 | Medium | Purchase price should be validated against selling price rules. | Invalid pricing combinations are blocked and surfaced with clear error. | P5 |
| FR-025 | Medium | Dashboard should show daily liters sold by fuel type as key KPIs. | Dashboard cards include Petrol, Diesel, Premium liters sold for the day. | P5 |
| FR-026 | Medium | Staff and allocation access should be available to manager role. | Manager role can open and use staff/allocation pages under role policy. | P10 |
| FR-027 | Medium | Employee profile should include Aadhar and Employee ID. | Create/edit employee supports both fields and persists values. | P10 |
| FR-028 | High | Employee ID must be unique at data-model level. | Duplicate employee_id is rejected by schema validation/unique constraint. | P10 |
| FR-029 | Medium | Error messaging should be standardized across UI. | Common errors (for example PIN mismatch) use consistent wording and format. | P10 |
| FR-030 | Medium | UPI QR must support credit customer payment flow and verification. | QR can be generated and payment confirmation updates customer balance. | P1 |

## Non-Functional Requirements

| ID | Priority | Requirement | Acceptance Criteria | Source |
|---|---|---|---|---|
| NFR-001 | High | System must support multiple tenants with data separation. | No cross-tenant data leakage in API or reports. | P1 |
| NFR-002 | High | System should handle 400+ concurrent add/view operations. | Load tests confirm stable throughput and acceptable error rate under target concurrency. | P1 |
| NFR-003 | High | Database layer must support high concurrent sales writes. | Concurrent write tests meet target with retry strategy for transient failures. | P1 |
| NFR-004 | High | Pilot should support 100 bunks with 8 to 10 employees each. | Core operations validated for projected tenant and staff volumes. | P1 |
| NFR-005 | High | Data must be persisted on cloud-backed storage. | Restart/redeploy does not lose operational data. | P5 |
| NFR-006 | High | Daily backup and restore process is required. | Daily backup job succeeds and restore drill can recover required datasets. | P1, P6 |
| NFR-007 | Medium | Product must support both mobile and desktop access. | Core employee and manager journeys work on mobile and desktop browsers. | P1 |
| NFR-008 | Medium | Architecture should be container deployable. | Services can be packaged and started in containerized environments. | P2 |
| NFR-009 | Medium | Resource planning must support growth to at least 100 tenants and 500+ employees. | Capacity model exists for CPU, memory, storage, and network with scaling triggers. | P10, P11, P12 |

## Security Requirements

| ID | Priority | Requirement | Acceptance Criteria | Source |
|---|---|---|---|---|
| SEC-001 | High | Authentication must use username/role/PIN where applicable. | Role-specific login works and unauthorized access is blocked. | P1 |
| SEC-002 | High | Idle sessions must auto-logout in configured timeout window. | Inactive browser session expires and requires re-authentication. | P6 |
| SEC-003 | High | Browser close should invalidate active session state. | Reopening browser does not restore stale authenticated session without valid token/session check. | P6 |
| SEC-004 | High | API must apply rate limiting/throttling. | Excess requests are throttled with clear response codes. | P6 |
| SEC-005 | High | SQL injection defenses must be present and tested. | Parameterized queries are enforced and injection test payloads fail safely. | P6, P7 |
| SEC-006 | High | Platform must be resilient to abuse traffic and burst load patterns. | Load and abuse simulations show controlled degradation and recovery behavior. | P6, P7 |
| SEC-007 | Medium | API timeout, retry with backoff, and circuit-breaker style handling should be in place for resilience. | Failure scenarios trigger bounded retry/backoff and prevent cascading failures. | P6 |
| SEC-008 | Medium | Sensitive data should not be insecurely exposed in client-side storage/cache. | Service worker and browser storage handling avoids caching/storing sensitive auth data unsafely. | P7, P8 |

## Operations and Deployment Requirements

| ID | Priority | Requirement | Acceptance Criteria | Source |
|---|---|---|---|---|
| OPS-001 | Medium | System should be cloud deployable for pilot users. | Cloud deployment supports station operations and remote access. | P1, P5 |
| OPS-002 | Medium | Deployment strategy should allow economical scale-up. | Platform selection documented with cost/performance trade-offs and migration path. | P9, P11, P12 |
| OPS-003 | Medium | Monitoring and alerting must cover traffic, errors, and resource health. | Dashboards/alerts exist for CPU, DB latency, queue lag, error rate, and traffic spikes. | P7, P11 |
| OPS-004 | Medium | Data-store strategy should support transactional reliability and reporting at scale. | Production plan uses ACID-compatible datastore with backup and replication strategy. | P11, P12 |

## QA and Test Automation Requirements

| ID | Priority | Requirement | Acceptance Criteria | Source |
|---|---|---|---|---|
| QA-001 | High | Security testing should include SQL injection and abuse-traffic test coverage. | Automated/manual test evidence exists for injection and high-load abuse scenarios. | P6, P7 |
| QA-002 | Medium | End-to-end automation should simulate multi-tenant provisioning and employee operations. | Automated suite can create bunks, add employees, assign shifts/pumps, and execute employee sale flows. | P10 |
| QA-003 | Medium | Continuous test execution environment is required. | CI pipeline runs test suite and publishes pass/fail artifacts. | P10 |

## Requirement Notes and Conflicts to Resolve
1. Database direction is inconsistent across notes.
- Early notes mention Cassandra/Redis/MongoDB and SQLite POC.
- Later notes recommend PostgreSQL for primary scale architecture.
- Product decision must explicitly define alpha and production database standards.

2. Employee portal scope is inconsistent.
- One note says employee portal can be removed.
- Later notes provide many employee portal enhancements.
- Product owner must confirm final portal scope.

3. Concurrency and capacity numbers vary.
- 400 concurrent writes is specified.
- Later scale notes discuss 500 employees and 5,000 to 10,000 total employees.
- Capacity planning should define phased load targets with measurable SLOs.

4. Some GUI notes are marked done/not fixed in source.
- This document treats all extracted items as requirements/backlog candidates until explicitly accepted or closed in tracked releases.

## Suggested MVP Cut (Pilot)
Must-have for pilot go-live:
- FR-001 to FR-010
- FR-015 to FR-023
- NFR-001, NFR-003, NFR-005, NFR-006
- SEC-001 to SEC-006
- OPS-001

Should-have for pilot hardening:
- FR-024 to FR-030
- NFR-002, NFR-007, NFR-008
- SEC-007, SEC-008
- QA-001

Can-have for post-pilot scale:
- NFR-009
- OPS-002 to OPS-004
- QA-002, QA-003
