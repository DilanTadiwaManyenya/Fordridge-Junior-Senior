# Stage 81 — Focused access regression checks

## Result

The isolated PGlite portal suite passed focused positive and negative access checks for active-role switching, campus and class assignment scope, parent-child links, teacher record writes, finance permissions, report release/readiness, library/newsletter access, and Activity Log reads.

Activity Log cases include Main Admin school-wide access, Principal assigned-campus access, Accountant own finance events within campus, Teacher own submitted events, Student/Staff denial, cross-campus filtering, and omission of `audit_trail.detail`.

## Verification

- `node scripts/test-portal.mjs` — passed against isolated local migrations and synthetic fixtures.
- Production Supabase was not accessed; no live records or accounts were used.
