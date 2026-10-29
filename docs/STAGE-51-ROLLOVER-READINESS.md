# Stage 51 — Add rollover readiness preview

Status: Implemented and locally verified; production migration and frontend release pending.

## Delivered

- Added a Main Admin-only read-only database preview with campus, text search, review-status filters, bounded page size, and server-side pagination.
- The preview classifies learners with active enrolment, campus, and current class as **Ready for review**. It flags unset enrolment status, missing campus/class, and inactive/graduated/transferred status with explicit reasons.
- An unset stream remains unset and is not treated as missing information for this preview. The page does not recommend promotion, infer destination classes, allocate streams, or update profiles.
- Added the Reliance-named **Year rollover readiness** navigation item and responsive review table with campus-scope summary counts.
- Added database regression checks for campus scoping, search, pagination, read-only behavior, Main Admin authorization, and anonymous access denial, plus mocked browser coverage.

## Validation

- `node scripts/test-portal.mjs` — passed with isolated PGlite data.
- `npm run lint` — passed with state-loading warnings consistent with existing workflow screens.
- `npm run build` — passed; existing large-bundle warning remains.
- `node scripts/test-portal-browser.mjs` with mocked Supabase requests — passed the read-only preview, review reasons, and unset-stream display checks.
- Production database and hosted frontend were not accessed or changed.

## Release state and next stage

Migration `20261029190000_year_rollover_readiness_preview.sql` and the frontend change have not been deployed. Stage 52 (validate rollover destination classes and proposed totals) follows next. Stream allocation remains unset until the school confirms it.
