# Stage 11: separate subject allocations

Date: 27 October 2026
Status: complete; committed and pushed to `origin/master` as `1ff87d7`
Approval basis: owner approval of the 85-stage roadmap and Reliance-inspired Stage 7 access matrix

## Acceptance scope

- Subject allocation is a separate **Subject allocations** workspace for administrators and a read-only assignment view for teachers.
- New allocations use the confirmed campus/class/optional-stream catalogue and have no preloaded subject names.
- Class-register assignments and subject-only allocations are distinguished in the existing Fordridge assignment table, preserving prior records and campus structure.
- Teacher Markbook submissions require both a learner in scope and an allocated subject for the learner's class/stream. Class-register assignments alone cannot write academic marks.
- Subject is stored separately from assessment title, appears in Progress reports/Analytics, and is preserved in future immutable report snapshots.
- The legacy Markbook RPC signature cannot bypass subject selection.
- A subject-only assignment does not grant class-register attendance write access. Legacy text assignments remain readable and continue to work where their existing subject matches.

## Implementation

- Added migration `20261009000000_subject_allocations.sql` with explicit assignment kind, `learner_records.subject`, a subject-scope helper, RLS restrictions, subject-required Markbook RPC, report/timetable scope updates and subject-aware report snapshots.
- Added the **Subject allocations** page and role-gated navigation entry. New subject names are entered by an administrator only after school confirmation; no names are seeded.
- Updated Class assignments to keep class-register work separate from subject-only allocations.
- Updated Bulk mark entry and single learner record forms to require an allocated subject for teacher academic writes.
- Updated Progress reports, Analytics and frozen Official reports to show and use the explicit subject.
- Extended isolated PGlite assertions for subject-only scope, class/stream restrictions, attendance denial, Markbook subject writes, the subjectless RPC block and assignment overlap.

## Checks

- `node scripts/test-portal.mjs` — PASS. Migration application; whole-class and stream scopes; subject-only profile access; no attendance grant from subject allocation; correct subject succeeds; unallocated subject/class/stream and old RPC signature are rejected; wellbeing stays private.
- `npm run build` — PASS. Existing large JavaScript chunk warning remains (752.56 kB minified).
- `npm run lint` — PASS (exit 0); the project reports React effect warnings, including the existing async-loading pattern in touched pages.
- Browser suite — not run; Playwright Chromium remains unavailable per the baseline.

## Deployment and next approval point

- The migration has not been applied to Supabase and the frontend has not been deployed. Obtain the separate production-migration/deployment approval required by the owner before applying or releasing this change.
- The subject allocation workflow reuses Fordridge's existing assignment table and keeps legacy rows intact. No school class, stream, capacity or subject data has been invented.
- Stage 12 adds server-controlled role membership and active-role support. Because that changes who can hold and switch permissions, pause for owner approval before implementing it.
