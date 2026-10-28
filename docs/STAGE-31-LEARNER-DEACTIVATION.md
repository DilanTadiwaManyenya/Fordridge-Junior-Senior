# Stage 31 — Learner deactivate/reactivate

Status: Implemented and validated locally; production migration pending owner approval

## Deliverable

- The existing learner enrolment status control supports deactivation and reactivation; the reasoned correction workflow from Stage 30 audits each status change.
- `active` and legacy unset statuses retain learner access. `inactive`, `graduated`, and `transferred` statuses deny learner self-access.
- Login rejects a disabled learner, and an already signed-in learner session is signed out when the portal reloads and checks the status.
- Row-level security blocks disabled learner self-reads for academic/attendance records, fees, fee transactions, announcements, timetable, and issued report snapshots. Ranking/signatory RPCs are also denied.
- Linked parents and authorised administrators/teachers retain existing scoped access to historical records. Reactivation restores access to the same records.
- No learner, guardian, payment, academic, or report data is deleted or rewritten.

## Validation

- `node scripts/test-portal.mjs` — passed. The isolated migration/RLS suite checks inactive learner denial, parent retention of academic/finance/report history, denied report RPC access, and restored learner access after reactivation.
- `node scripts/test-learner-export.mjs` — passed.
- `npm run lint` — passed with existing React effect and unused-variable warnings.
- `npm run build` — passed. Vite reports the existing large JavaScript chunk advisory.
- `node scripts/test-portal-browser.mjs` — passed in Chrome with mocked backend requests; covers sign-in rejection and existing-session handling for inactive learners.
- `git diff --check` — passed.

## Deployment gate

The migration is `20261028110000_learner_deactivation_access.sql`. It has not been applied to production. Deploy the migration before the frontend. Production migration and frontend deployment remain pending the owner approval required by the roadmap.
