# Stage 50 — Add historical class context

Status: Implemented and locally verified; production migration and frontend release pending.

## Delivered

- Future report releases capture learner name, admission number, class level, stream, and campus name into the immutable report snapshot.
- New snapshot identity fields are protected by a version 2 fingerprint. The integrity verifier accepts existing version 1 fingerprints unchanged and recalculates the extended version 2 format for new releases.
- The Official reports view displays release-time identity and campus context. It does not join the learner's current profile or current campus name to reconstruct old identity.
- Existing snapshots are not backfilled from current profiles. They remain explicitly marked as missing historical identity context, and the report shows that limitation.
- Added isolated checks for captured fields, versioned integrity, class-context tampering, and mocked browser display for new and legacy releases.

## Validation

- `node scripts/test-portal.mjs` — passed with isolated PGlite data.
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed; existing large-bundle warning remains.
- `node scripts/test-portal-browser.mjs` with mocked Supabase requests — passed new and legacy report identity display.
- Production database and hosted frontend were not accessed or changed.

## Release state and next stage

Migration `20261029180000_historical_report_class_context.sql` and the frontend change have not been deployed. Stage 51 is next in the approved roadmap. Earlier migrations and frontend releases remain subject to the production deployment/approval process.
