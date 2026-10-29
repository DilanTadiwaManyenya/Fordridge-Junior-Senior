# Stage 40 — Report period registry

Status: Implemented and locally verified; database migration and frontend release pending

## Changes

- Added campus-scoped `reporting_periods` with academic year, term, open/closed state, current-period flag, and monotonically managed revision number.
- Added append-only `reporting_period_events` to record period registration now and support reviewed state changes in later stages.
- Existing campus-specific report settings and publication periods are copied into the registry at revision 1. They start as `open`; publication remains independently shown as Draft/Published and does not alter period state. Unscoped settings without a campus are not copied.
- Added an administrator-only register function and Reporting periods screen. It lists period status, current selection, revision, and independent report-release status.
- Added administrator-only RLS for registry reads, blocked direct row writes, and a route guard for other roles.
- No dates, current period, close/reopen actions, or school calendar assumptions were added. New periods begin open and not current.

## Validation

- `node scripts/test-portal.mjs` — passed in isolated PGlite. Covers registration, first revision/event, duplicate rejection, teacher denial, and publication remaining separate from period state.
- `npm run lint` — passed with existing React warning findings.
- `npm run build` — passed; existing large JavaScript chunk advisory remains.
- `node scripts/test-portal-browser.mjs` — passed with mocked backend and installed Chrome; verified the administrator registration flow and parent route denial.
- `git diff --check` — passed.

The migration has not been applied to production and the frontend has not been deployed. Backfill is additive and copies only existing period identities; no report or learner data is modified or removed.
