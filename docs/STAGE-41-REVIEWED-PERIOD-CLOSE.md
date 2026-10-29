# Stage 41 — Reviewed reporting-period close

Status: Implemented and locally verified; database migration and frontend release pending

## Changes

- Added an administrator-only close RPC that checks the active role and campus, requires a reason, locks the period row, and checks the revision displayed by the administrator before changing state.
- Closing advances the revision and appends a reasoned event plus an Activity Log audit record. Concurrent or stale submissions fail without changing state.
- Teachers can read reporting-period state for their own campus so the mark-entry workspace can explain why a period is unavailable; they cannot close or register periods.
- The shared Markbook/Coursework form disables saving for a closed period. A database trigger also blocks direct insert, update, and delete of academic records in that period.
- Existing report-publication protections remain in place and separate from the explicit period close state.

## Validation

- `node scripts/test-portal.mjs` — isolated PGlite coverage for admin close, revision advancement, reason/event/audit retention, stale revision and short-reason rejection, teacher read-only access, and blocked RPC/direct mark writes.
- `node scripts/test-portal-browser.mjs` — mocked Chrome coverage for administrator close interaction and the revision/reason submitted to the backend.
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed; Vite reports the existing large JavaScript chunk advisory.
- `git diff --check` — passed.

The migration has not been applied to production and the frontend has not been deployed. No production data was changed. Reopening, selecting the current period, dates, and calendar assumptions remain outside this stage.
