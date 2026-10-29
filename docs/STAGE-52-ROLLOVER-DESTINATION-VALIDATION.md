# Stage 52: rollover destination validation

Date: 29 October 2026
Status: implemented and locally verified; production migration and frontend release pending
Roadmap stage: 52 of 85
Implementation commit: `fa48283`

## Deliverable

Added a Main Admin-only destination capacity preview to Year rollover readiness. It lists active, already configured classes and streams for the selected campus scope, counts matching active learner records, and compares a manually entered proposed additional count with recorded capacity.

The preview:

- uses `preview_year_rollover_destinations`, a read-only `SECURITY DEFINER` RPC restricted to the current Main Admin;
- leaves the class catalogue untouched and displays no free-form class or stream creation controls;
- requires a configured stream selection when the chosen class has active streams;
- uses class capacity only when a class has no active streams, and stream capacity when streams exist;
- leaves missing capacity unknown instead of treating it as zero;
- flags active learners with an unset or unmatched stream so stream counts are not mistaken for a complete class assignment;
- labels projected counts as a what-if comparison and does not promote, place, or update any learner.

This respects Fordridge's decision to keep class names, streams, and stream allocation unset until the school confirms them. A campus with no active configured classes gets a clear empty state.

## Validation

- `node scripts/test-portal.mjs` — passed. Isolated PGlite applied the migration and checked class/stream counts, optional capacity, empty stream configuration, anonymous denial, non-admin denial, and existing portal regressions.
- `node scripts/test-portal-browser.mjs` — passed with all backend requests mocked. Covered over-capacity calculation, unknown capacity, unresolved stream warning, and no learner placement flow.
- `npm run lint` — passed with existing repository warnings, including React effect-state warnings.
- `npm run build` — passed. Existing large-bundle warning remains.
- `git diff --check` — passed.

## Deployment state

The migration is versioned locally and pushed with this stage's code. It has **not** been applied to production, and the frontend has **not** been deployed. Production migration and deployment remain subject to the owner's separate approval and the documented backup/deployment process.
