# Stage 55: Transactional year rollover

## Outcome

Main Admin can apply one reviewed year rollover for a selected campus. A successful run updates the active roster in one database transaction and creates an auditable run record. A cycle already applied to that campus cannot be applied twice.

## Safeguards

- The RPC requires the active Main Admin role, an existing campus, valid source/destination years, an expected active learner count, and the exact confirmation `APPLY YEAR ROLLOVER {source} TO {destination}`.
- It locks the selected campus and relevant profile, decision, and class catalogue tables while it rechecks the roster and destinations. If a check fails, the transaction rolls back as a whole.
- Every active learner must have a current decision and any required configured destination. Destination over-capacity blocks the run. Unknown capacity requires a separate explicit acknowledgement.
- Promote and Retain apply only their reviewed class/campus/stream placement. Transfer changes enrolment status to `transferred`; Complete changes it to `graduated`. The `profiles.id`, admission number, name, linked records/marks, fees, guardian links, and report snapshots are not rewritten or deleted.
- The run captures the actor, time, counts, capacity acknowledgement count, and per-learner before/after audit details. Applied decision rows are locked against later edits.
- A repeated call for the same campus and year pair returns the existing run without reprocessing learners or duplicating audits.

## Validation

- `node scripts/test-portal.mjs`: pass. Isolated PGlite verifies full-batch application, all four decisions, teacher denial, wrong expected count, wrong confirmation, missing capacity acknowledgement, rollback/no mutation on failed preflight, preserved IDs and linked record/fee/guardian counts, applied-decision lock, status lookup, and idempotent retry.
- `npm run lint`: exit 0; existing lint warnings remain elsewhere in the project.
- `npm run build`: pass; existing large JavaScript chunk warning remains.
- `git diff --check`: pass.
- Mocked Chrome apply flow: pass for review gating, exact confirmation, and the single apply RPC request. The full suite continues afterward and stops at the tablet horizontal-overflow assertion at `scripts/test-portal-browser.mjs:754`.

## Deployment status

The new migration `20261029230000_apply_year_rollover_batch.sql` and frontend changes are local only. No production database was accessed or changed, and no frontend deployment was made. Production migration and hosted frontend release remain pending their separate approvals and the school-verified rollover year/class allocations.

## Git checkpoint

Commit and GitHub push are recorded in `docs/STAGE-TRACKER.md` after the stage commits are created.
