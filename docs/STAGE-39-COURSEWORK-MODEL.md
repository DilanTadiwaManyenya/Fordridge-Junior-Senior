# Stage 39 — Coursework model

Status: Implemented and locally verified; database migration and frontend release pending

## Changes

- Added an `assessment_type` discriminator to academic records. Existing records default to `markbook`, reflecting the only mark-entry workflow Fordridge had before Coursework.
- Added a Course Work page and role-protected route for the same teacher and administrator roles allowed to enter Markbook results. It reuses the assignment-driven campus/class/stream/subject roster and writes through its own database RPC.
- Kept Coursework results as raw score and maximum score. They appear distinctly in progress reports and immutable report snapshots, but they are excluded from the existing report average, grade, and ranking until Fordridge approves a weighting rule.
- Markbook and Coursework RPCs both retain the Stage 37 input checks, active teacher subject scope, and duplicate protection.
- Added a database guard for published periods. It blocks direct and RPC-based inserts, updates, and deletions for Markbook or Coursework after report publication.
- Added isolated tests for scoped Coursework writes, type separation, snapshot visibility, average isolation, and the published-period guard.

No coursework weighting, component count, period dates, streams, or level-specific grade rules were added. The Junior/Senior page uses only class and subject assignments already present in Fordridge.

## Validation

- `node scripts/test-portal.mjs` — passed in isolated PGlite, including all migrations and access/period regression cases.
- `npm run lint` — passed with existing React warning findings.
- `npm run build` — passed; the existing large JavaScript chunk advisory remains.
- `git diff --check` — passed.
- `node scripts/test-portal-browser.mjs` — passed against the local Vite server using the installed Chrome executable; verifies the teacher Course Work page and parent route denial. Backend requests were mocked. The browser suite's bundled Playwright Chromium was not installed, so `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selected the existing Chrome installation.

The migration has not been applied to production and the frontend has not been deployed. No student data is copied, removed, or rewritten; the new column has a non-null default for existing academic records.
