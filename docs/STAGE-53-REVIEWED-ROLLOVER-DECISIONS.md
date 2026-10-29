# Stage 53: reviewed learner rollover decisions

Date: 29 October 2026
Status: implemented and locally verified; production migration and frontend release pending
Roadmap stage: 53 of 85

## Deliverable

The Main Admin can record one explicit Promote, Retain, Transfer, or Complete decision per active learner for manually selected source and destination academic years. A reason of at least 10 characters is required. Decisions are tied to a snapshot of the learner's campus, class, stream, and active enrollment status and are blocked if that roster information changed since review.

The decision record is intent only. It does not update learner enrollment, class, campus, or stream and does not choose a destination class or stream. Class and stream names remain unset unless school-approved values already exist. Decision creation and amendment are written to Activity Log; previous decisions are replaced only for the same learner/year cycle, with each amendment retained in the audit trail.

## Validation

- `node scripts/test-portal.mjs` — passed. Isolated PGlite applied the migration; verified cycle/year checks, decision persistence and amendment audit, unchanged learner profile, stale-snapshot rejection, Main Admin enforcement and anonymous denial.
- `node scripts/test-portal-browser.mjs` — passed with all backend requests mocked. Covered cycle entry, per-learner decision/reason save, reviewer display, and continued read-only placement behavior.
- `npm run lint` — passed with existing repository React effect-state and dependency warnings.
- `npm run build` — passed with the existing large-bundle warning.
- `git diff --check` — passed.

## Deployment state

Migration `20261029210000_reviewed_year_rollover_decisions.sql` and the frontend are committed and pushed to GitHub. The migration has not been applied to production and the frontend has not been deployed. The live release remains subject to the owner's separate production approval and backup/deployment process.
