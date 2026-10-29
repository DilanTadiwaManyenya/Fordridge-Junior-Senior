# Stage 49 — Verify report snapshot integrity

Status: Implemented locally; production migration and frontend release pending.

## Delivered

- Replaced the lookup-only fingerprint check with an administrator-only database function that recalculates the MD5 fingerprint from the frozen snapshot fields using the existing Stage 45/48 hash definition. It can find the report by its stored fingerprint or recomputed fingerprint, so damage to the fingerprint column itself is also surfaced when the report contents still match the supplied fingerprint.
- The verification screen distinguishes a valid release, an unknown fingerprint, and a detected content mismatch. It does not display learner assessment data.
- A mismatch creates an Activity Log entry with the snapshot, publication, period, saved fingerprint, calculated fingerprint, and authenticated actor. The page tells administrators not to rely on the report and to investigate the audit record.
- Added isolated regression coverage for a valid snapshot, unknown fingerprint, unauthorized teacher, tampered content, tampered stored fingerprint, audit attribution, and verification after restoring the synthetic fixture.
- Added mocked browser flow coverage for valid, mismatch, and not-found states.

## Validation

- `node scripts/test-portal.mjs` — passed with isolated PGlite data.
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed; existing bundle-size warning remains.
- `node scripts/test-portal-browser.mjs` with mocked Supabase requests — passed valid, mismatch, and not-found verification flows.
- Production database and hosted frontend were not accessed or changed.

## Release state and next stage

Migration `20261029170000_verify_report_snapshot_integrity.sql` and the frontend change have not been deployed. Stage 50 (add historical class context) follows next. Earlier migrations and frontend releases remain subject to the production deployment/approval process.
