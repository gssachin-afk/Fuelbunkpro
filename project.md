# FuelBunk Pro Project Overview

## Purpose
FuelBunk Pro is a multi-tenant fuel station management platform for daily fuel operations, sales capture, staff shift handling, inventory reconciliation, and management reporting.

The system supports both pilot rollout (3 to 4 bunks) and scale-up operation (100+ bunks) using cloud deployment and centralized data persistence.

## Problem Statement
Fuel station operations are currently fragmented across manual processes and disconnected tools. The project aims to provide:
- Reliable end-of-shift sales recording by employees.
- Cross-shift operational control for managers.
- Multi-station (tenant) data isolation for a central operator.
- Unified reporting for operations, finance, and administration.

## Target Users
- Super Admin: Manages tenants, platform-wide settings, and role-level controls.
- Station Owner/Manager: Manages staff, shifts, allocations, and station-level reporting.
- Employee (Pump Attendant): Records shift readings and sales using assigned credentials.

## Product Goals
1. Capture and persist shift-based fuel sales and meter readings accurately.
2. Ensure tenant-level data separation across all stations.
3. Provide role-based dashboards for operations and decision-making.
4. Enable secure cloud access from desktop and mobile clients.
5. Support high-write concurrency for end-of-shift data entry windows.

## Core Capabilities
- Tenant and station administration.
- Employee directory, shift roster, and allocation management.
- Pump/nozzle mapping and opening/closing meter capture.
- Sales logging with payment mode breakdown (cash/card/UPI/credit).
- Tank inventory and dip-reading linkage.
- Credit management with UPI QR integration and payment verification.
- Daily and monthly reporting (including employee shift and attendance views).
- Backup and restore strategy.

## Pilot Scope
- Initial rollout to 3 to 4 bunks.
- Mobile access for employee workflows.
- Desktop dashboard for admin/manager workflows.
- Cloud-hosted environment with persistent backend storage.

## Scale Targets from Requirements
- 100 bunks.
- 8 to 10 employees per bunk.
- 400+ concurrent record add/view operations during peak windows.
- 400 concurrent sale writes with retry/fault-tolerance behavior.

## Success Criteria
- End-of-shift recording can be completed once per employee per day without data loss.
- Manager can view employee-level sales trends and live shift status.
- Changes in staff, permissions, and pump/nozzle assignments reflect consistently across modules.
- Security controls (auth, session timeout, throttling, input safety) are enforced.
- Platform remains stable under projected pilot and scale load conditions.

## Current Technology Direction
Based on the latest decision trail in the requirement source, the preferred production direction is:
- API-first architecture.
- Containerized services.
- PostgreSQL as the primary datastore for transactional and reporting workloads.

Earlier exploratory notes mention SQLite for alpha and NoSQL options for high concurrency; these are tracked in requirement decision notes for explicit finalization.
