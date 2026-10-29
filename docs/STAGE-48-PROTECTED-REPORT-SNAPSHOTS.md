# Stage 48 — Preserve protected report snapshots

Status: Implemented and locally verified; production migration pending approval.

## Delivered

- Revoked direct insert, update, delete, and other write privileges on released learner snapshots from `PUBLIC`, `anon`, and `authenticated`; authenticated users retain read access within the existing row-level policy.
- Prevents deleting a report publication when learner snapshots exist, avoiding the publication foreign-key cascade from removing issued reports.
- Blocks returning a period to release after it has existing issued snapshots, preventing the publication triggers from replacing an earlier issue with newer marks or profile-derived values.
- Verified profile corrections and a later academic mark, after return-to-draft and reviewed period reopening, leave every field of the original snapshot unchanged, including the integrity hash.
- No frontend behavior changed. No live database was accessed.

## Validation

- `node scripts/test-portal.mjs` — passed the migration, direct client write denial, protected publication delete, re-release denial, and full snapshot equality checks using isolated PGlite synthetic data.
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed; existing bundle-size warning remains.
- `git diff --check` — passed.

## Release state and next stage

Migration `20261029160000_protect_report_snapshots.sql` has not been applied to production. Stage 49 (verify snapshot integrity) follows next. Earlier migrations and frontend releases remain subject to the production deployment/approval process.
