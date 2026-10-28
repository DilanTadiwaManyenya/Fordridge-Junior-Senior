# Stage 30 — Controlled learner corrections

Status: Implemented and validated locally; production migration pending owner approval

## Deliverable

- Existing learner profiles now require an administrator-entered correction reason (10–500 characters) before saving.
- A new `admin_correct_learner_profile` database function validates the active administrator role, target learner, reason, profile fields, and valid enrolment status.
- Each accepted correction appends an audit entry with the acting administrator, reason, and changed fields with their previous and new values.
- The legacy `admin_update_profile` RPC refuses learner profiles, so learner edits cannot bypass the reason/audit path. It remains available for existing staff profile edits.
- Corrections update the current learner profile only. Issued report-release snapshots are not changed or regenerated.

## Validation

- `node scripts/test-portal.mjs` — passed. Covers migration order/application, invalid and missing reasons, blocked legacy learner edits, actor/reason/field audit details, administrator-only authorization, and snapshot immutability after a correction.
- `node scripts/test-learner-export.mjs` — passed.
- `npm run lint` — passed with existing React effect and unused-variable warnings; no new lint warning was introduced.
- `npm run build` — passed. Vite reports the existing large JavaScript chunk advisory.
- `node scripts/test-portal-browser.mjs` — passed in Chrome with mocked backend requests; covers reason submission in learner profile edit.
- `git diff --check` — passed.

## Deployment gate

The new migration is `20261028100000_controlled_learner_profile_corrections.sql`. It has not been applied to production. The frontend now calls the new RPC for learner corrections, so deploy the migration before deploying the frontend. Production migration and frontend deployment remain pending the owner approval required by the roadmap.
