# Stage 32 — Guarded learner deletion

Status: Complete and pushed; production migration pending owner approval

## Review and decision

The Learners directory has no hard-delete control or direct profile-delete call. The database review found that `learner_records` and `fee_records` references generally restrict profile removal, but `report_release_snapshots`, `student_guardians`, role memberships, role contexts, and announcement-read rows include cascade paths. In particular, deleting a learner profile with no restrictive academic/fee row could silently remove issued report snapshots and guardian links.

To preserve history consistently, Stage 32 blocks hard deletion for every learner, including learners with no known records. Staff can use the audited Stage 30/31 deactivate/reactivate flow instead.

## Safeguard

- Revoke profile `DELETE` from `PUBLIC`, `anon`, and `authenticated` so portal clients cannot use the administrator's broad profile policy to hard-delete.
- Add a `BEFORE DELETE` trigger that rejects student profiles with a clear instruction to deactivate them.
- The trigger also blocks deletion through an `auth.users` cascade or privileged backend path. It does not delete or alter any learner, guardian, fee, academic, or report data.

Migration: `20261028120000_block_learner_profile_deletes.sql`.

## Validation

- `node scripts/test-portal.mjs` — passed. Confirms authenticated profile deletion is denied, an auth-user cascade is stopped by the trigger, and learner fees, academic records, and issued snapshots remain.
- `npm run lint` — passed with existing React effect, hook dependency, and unused-variable warnings.
- `npm run build` — passed; Vite reports the existing large JavaScript chunk advisory.
- `node scripts/test-portal-browser.mjs` — passed in Chrome with mocked backend requests.
- Source review confirmed no learner hard-delete control or client call exists.
- `git diff --check` — passed.

## Deployment

The migration has not been applied to production. It is non-destructive and only removes portal `DELETE` permission and rejects learner-profile deletion attempts; production application still requires the owner approval required by the roadmap.
