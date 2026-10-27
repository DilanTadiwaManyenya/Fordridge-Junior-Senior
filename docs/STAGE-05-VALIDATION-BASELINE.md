# Stage 5: pre-change validation baseline and follow-up

Date: 27 October 2026
Baseline commit: a760eaf
Follow-up changes: Fordridge report-signatories SQL migrations

## Original baseline

| Check | Original result | Notes |
| --- | --- | --- |
| `npm run build` | Passed | Vite 8.3.0 transformed 251 modules. The generated JavaScript chunk was 735.40 kB (196.66 kB gzip), above the 500 kB notice. |
| `npm run lint` | Passed with warnings | Oxlint exited 0 with existing React effect setState warnings and a missing `selected` dependency warning in BulkMarks.jsx. |
| `node scripts/test-portal.mjs` | Failed | PGlite rejected malformed PL/pgSQL in the live signatory function migration, then the copied snapshot function had the same malformed initials expression. |
| `node scripts/test-portal-browser.mjs` | Could not launch | The Playwright Chromium headless shell executable was missing. The browser test body did not run. |

## Stage 5 follow-up

Source inspection found that the teacher initials expression passed only one argument to `coalesce` and gave `nullif` an em dash comparison rather than an empty-string comparison. The whitespace regex also used excess backslashes. The report release snapshot trigger repeated the same expression.

Both expressions now use a correctly escaped whitespace split, return a fallback em dash for blank initials, and parse as valid SQL/PLpgSQL. The existing role, learner, campus and class authorization checks remain unchanged.

After correcting both migrations, `node scripts/test-portal.mjs` passes:

> PASS: migrations, atomic payments, retry safety, rollback, profile permissions, published notices, class scoping, guardian access, private records and teacher login.

This applies all local migration files to isolated PGlite. It does not connect to or modify Fordridge production. Build and lint were not rerun; the change is confined to SQL function expressions. The browser test remains unrun because Chromium is absent. No browser was installed in this follow-up.

## Remaining validation work

- Install or locate the project's expected Playwright browser in an authorised local environment, then run `node scripts/test-portal-browser.mjs` against the local app.
- Keep production migration history, effective RLS, deployed functions, SMS delivery and hosted frontend status marked unverified until separately checked.

The original baseline results remain historical evidence. The follow-up result records the correction and the isolated-suite pass; don't report the original PGlite failure as still present.
