# Stage 29 — Learner roster filters

Status: Complete and pushed

## Deliverable

Added class/form, stream, and enrolment-status filters to the Learners directory. Class and stream options come from Fordridge's existing school class catalogue; no class or stream allocations were invented or seeded. Search remains available, and CSV export uses the currently visible filtered records. On small screens, the filters stack into a single column.

## Validation

- `npm run build` — passed. Vite reports the existing large JavaScript chunk advisory.
- `npm run lint` — passed with the repository's existing warnings; this change introduces no new warning category.
- `node scripts/test-portal.mjs` — passed (isolated database and access regression checks).
- `node scripts/test-learner-export.mjs` — passed.
- `node scripts/test-portal-browser.mjs` — passed in Chrome with all Supabase requests mocked; covers class, stream, active/former status filters and the roster/export flow.
- `git diff --check` — passed.

## Deployment and data

No database migration or production data change is required. Hosted frontend deployment remains pending and was not performed as part of this stage.
