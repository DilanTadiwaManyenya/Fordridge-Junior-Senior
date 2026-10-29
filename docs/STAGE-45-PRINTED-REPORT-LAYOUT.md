# Stage 45 — Printed report layout

Status: Implemented and locally verified; hosted frontend release pending.

## Delivered

- Formats the live progress report for A4 portrait printing with controlled margins and compact page-level spacing.
- Hides portal navigation, page controls, filters, and transient errors/status from printed output.
- Uses a constrained report heading so learner identity and context wrap within the printable page.
- Adds admission number, campus, class, and stream when Fordridge has those values.
- Sets a descriptive browser print title from learner, report variant, term, and year, restoring the original page title after printing.
- Keeps the report on its natural content height to avoid an unnecessary blank overflow page.
- Leaves report calculations, released snapshots, and the database schema unchanged.

## Validation

- `node scripts/test-portal-browser.mjs` with installed Chrome — passed mocked Junior, Senior, and Sixth Form flows, A4 print media assertions, learner context/title, printable width, hidden portal controls, no forced report min-height, and no browser errors. All backend requests were mocked.
- Print preview screenshot: `.portal-test-tools/stage45-progress-report-print.png` (synthetic learner data).
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed; existing bundle-size warning remains.
- `git diff --check` — passed.

## Release state and next stage

No database migration is needed for Stage 45. The frontend has not been deployed. Stage 46 report-readiness checks are recorded in [the Stage 46 record](STAGE-46-REPORT-READINESS.md), and Stage 47 report release/audit checks in [the Stage 47 record](STAGE-47-REPORT-RELEASE-AUDIT.md). Stage 48 (protected report snapshots) follows next. Earlier pending migrations and frontend releases remain subject to the production deployment/approval process.
