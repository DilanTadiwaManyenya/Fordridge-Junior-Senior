# Stage 5: pre-change validation baseline

Date: 27 October 2026
Starting commit: a760eaf
Scope: validation only; no application code changes

## Results

| Check | Result | Notes |
| --- | --- | --- |
| `npm run build` | Passed | Vite 8.3.0 transformed 251 modules. Existing warning: generated JavaScript chunk is 735.40 kB (196.66 kB gzip), above the 500 kB notice. |
| `npm run lint` | Passed with warnings | Oxlint exits 0 and reports existing React effect setState warnings across page components, plus a missing `selected` dependency warning in BulkMarks.jsx. These are baseline findings; this stage changed no application source. |
| `node scripts/test-portal.mjs` | Failed | PGlite parser rejects the PL/pgSQL in `supabase/migrations/20261006140000_report_signatories.sql` (`report_subject_signatories`), with `mismatched parentheses at or near ";"`. The isolated database suite therefore cannot establish the remaining migration/RLS assertions. No live database was accessed. |
| `node scripts/test-portal-browser.mjs` | Could not launch | Playwright reports that its configured Chromium headless shell executable is missing under the local Playwright cache. The browser test body did not run. No browser was installed in this stage. |

The local Vite server started successfully on 127.0.0.1:5179 for the browser attempt and was stopped afterward. Browser tests are written to mock Supabase requests; no school records were used.

## Interpretation and follow-up

The application bundles successfully. Lint warnings and the report-signatories database-suite parse failure predate the first feature implementation in this roadmap. Preserve these results as the comparison point; don't attribute them to subsequent stages.

Before feature work depends on the isolated database suite, Stage 5 follow-up should determine whether the PGlite/PL/pgSQL parser limitation can be worked around safely or whether the migration routine needs a valid, tested correction. Compare with actual PostgreSQL syntax and the isolated test harness; never weaken or skip the report access checks to make the suite pass. Browser-suite follow-up requires installing/locating the project's expected Playwright browser in an authorised local environment.

Live Supabase migration status, RLS and Edge Function deployment, SMS delivery, and Vercel deployment remain outside this local baseline and are unverified.

## Workspace state

The only intended repository change is this baseline record. Existing ignored test tooling and application files were not modified. Diff whitespace checks are run before commit. Stage 6 updates the master roadmap/tracker with verified feature mappings and completed stages.
