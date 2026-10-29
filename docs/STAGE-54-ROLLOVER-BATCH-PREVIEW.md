# Stage 54: year rollover batch preview

Date: 29 October 2026
Status: implemented and locally verified; production migration and frontend release pending
Roadmap stage: 54 of 85
Implementation commit: `d5eef1c`

## Deliverable

Added a paginated, Main Admin-only batch preview for a manually selected source/destination academic-year cycle and campus scope. It lists the active learners in scope, their reviewed decision and reason, any proposed configured destination, and a batch summary of missing decisions, placements, stale rosters, unavailable destinations, and capacity states.

For Promote and Retain, a reviewer may save a proposed class and, where that configured class has active streams, a required configured stream. Proposals use catalogue IDs with restrictive foreign keys and are recorded in Activity Log. Changing a decision to Transfer or Complete clears an obsolete internal destination. Those outcomes need no internal destination.

The batch preview checks that the learner still matches the reviewed roster snapshot, that the selected class/stream is active and properly related, and whether the proposed active roster would exceed a recorded capacity. An unset capacity remains unknown. Over-capacity proposals are flagged; no destination is invented when the school catalogue is empty.

This stage does not execute a rollover or change learner profiles, enrolment status, campus, class, or stream. Stage 55 owns transactional execution.

## Validation

- `node scripts/test-portal.mjs` — passed. Isolated PGlite applied all migrations and checked destination relationship validation, batch counts/statuses, within/over/unknown capacity, role authorization, decision amendment cleanup, and unchanged learner profiles.
- `node scripts/test-portal-browser.mjs` — passed with all backend requests mocked. Covered year-cycle batch summary, missing placement, proposed destination save, reviewer and capacity display, and no profile move.
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed with the existing large-bundle warning.
- `git diff --check` — passed.

## Deployment state

Migration `20261029220000_year_rollover_batch_preview.sql` and the frontend are committed and pushed to GitHub. The migration has not been applied to production; the frontend has not been deployed. Any production release remains subject to the owner's approval and the documented backup/deployment process.
