# Stage 46 — Preserve report readiness checks

Status: Implemented and locally verified; hosted frontend release pending.

## Delivered

- Added mocked browser regression checks for the readiness card states: academic records and complete grade bands are ready; missing approval names and an unreleased period require action.
- Added isolated database preflight regressions proving that release is rejected when the period has no learner marks, when the applicable class-level grade scale is missing, or when class-teacher/head-of-school approval names are missing.
- Kept a positive release case after required marks, grade bands, and approval names are present.
- Verified the temporary grade-band fixture is rolled back before the positive release case; no production or real school data is touched.
- No application or migration code change was needed: Fordridge's existing readiness page and database release triggers already enforce these checks. This stage protects that behavior against regression.

## Validation

- `node scripts/test-portal.mjs` — passed the three negative release-gate checks and successful release/snapshot flow using isolated PGlite synthetic data.
- `node scripts/test-portal-browser.mjs` with installed Chrome — passed mocked readiness cards and the broader portal regression suite. All backend requests were mocked.
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed; existing bundle-size warning remains.
- `git diff --check` — passed.

## Release state and next stage

No database migration is needed for Stage 46. No frontend behavior changed. The frontend has not been deployed. Stage 47 (report release and audit) follows next. Earlier pending migrations and frontend releases remain subject to the production deployment/approval process.
