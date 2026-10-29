# Stage 42 — Reviewed reopen and current-period selection

Status: Implemented and locally verified; database migration and frontend release pending

## Changes

- Added an administrator-only review RPC for reopening a closed reporting period or making an open period current.
- Both actions require an 8–500 character reason and the revision shown in the administrator screen. Current-period switches also check the current period ID and revision.
- Current-period handoff is serialized by locking the campus row. It atomically unsets the previous selection and sets the new one; each affected period receives its own revision, reasoned event, and Activity Log record.
- The Reporting periods screen exposes Reopen and Make current actions with reason forms. Reopening does not remove report-publication protections.
- No dates, term boundaries, or automatic calendar rules were introduced.

## Validation

- `node scripts/test-portal.mjs` — isolated PGlite covers admin authorization, reason and stale revision rejection, reopening, current-period handoff, revision increments on both affected periods, event/audit records, and one-current-per-campus behavior.
- `node scripts/test-portal-browser.mjs` — mocked Chrome covers close, reopen, and current selection interactions and request payloads.
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed; the existing large JavaScript chunk advisory remains.
- `git diff --check` — passed.

The migration has not been applied to production and the frontend has not been deployed. No production data was changed.
