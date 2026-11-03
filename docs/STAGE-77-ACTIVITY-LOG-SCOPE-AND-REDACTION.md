# Stage 77 — Activity Log scope and redaction

## Delivered

- Activity Log reads now use a database function that returns only event ID, campus, action, area, timestamp, actor name, and campus name. It never returns `detail`, which can contain change reasons or other sensitive context.
- Main Admin can read school-wide events.
- Principal can read events attributed to the active campus.
- Accountant can read only their own finance event types for the active campus.
- Teacher can read only events they submitted.
- Parent, Student, Staff, anonymous callers, and other roles are denied by the database function; the portal menu and direct route follow the same supported role set.
- Campus Admin remains disabled. Stage 15 intentionally maps campus-scoped admin grants to Staff until those role policies are implemented; Stage 77 does not bypass that boundary.

## Verification

- `node scripts/test-portal.mjs` — passed in isolated PGlite, including Main Admin, Principal, Accountant, Teacher and Student cases, cross-campus/other-actor exclusions, and omission of audit detail.
- `npx oxlint src/portal/ActivityLog.jsx src/portal/PortalDashboard.jsx scripts/test-portal.mjs` — passed with existing React effect and unused-variable warnings.
- `npm run build` — passed; 278 modules transformed, with the existing large JavaScript chunk warning.
- `git diff --check` — passed.

## Release status

Migration: `20261107000000_activity_log_scope_and_redaction.sql`. Production migration and hosted frontend release have not been performed.
