# Stage 56: Audit and safe rollover reversal

## Outcome

Main Admin can preview whether an applied campus/year rollover is safe to reverse. The reversal restores only each learner's captured campus, class, stream, and enrolment status, and only when all learners still match the applied state. It leaves learner-linked academic/attendance records, fees, guardian links, and issued report snapshots untouched.

## Safeguards and audit

- Preview and reversal RPCs require the active Main Admin role and a selected campus/year pair.
- Reversal is blocked if an applied decision record is missing or if any learner's campus, class, stream, or enrolment status changed after the batch. The UI identifies the affected learner rows without attempting a partial restore.
- Reversal requires a 10–500 character reason and exact confirmation: `REVERSE YEAR ROLLOVER {source} TO {destination}`.
- Each restored learner gets an audit event with original decision/reason, reversal reason, and before/after roster state. A batch-level reversal event links to the original run, actor, and application time.
- The run record retains both application and reversal actor/time/reason. A repeated reversal returns the existing result and does not make additional changes or duplicate audit events.
- The cycle stays closed after reversal to preserve the one-run audit trail; a second application for the same campus/year pair is not offered.

## Validation

- `node scripts/test-portal.mjs`: pass. Isolated PGlite verifies eligibility for unchanged roster, rejection after a later placement change, role denial, required reason and exact confirmation, full roster restoration, unchanged record/fee/guardian counts, per-learner and batch audit history, reversed status, and idempotent retry.
- `node --check scripts/test-portal-browser.mjs`: pass.
- `npm run lint -- --quiet`: pass.
- `npm run build`: pass; Vite reports the existing large JavaScript chunk warning.
- Chrome browser suite: blocked before Stage 55/56 rollover screens by the tablet horizontal-overflow assertion at `scripts/test-portal-browser.mjs:709`; the Stage 56 browser interaction is added but not reached by the full suite.
- `git diff --check`: pass.

## Deployment status

Migration `20261030000000_audit_reverse_year_rollover_batch.sql` and frontend changes are local only. No production database or hosted frontend was changed. Production migration and frontend release need their separate approvals. The same campus/year pair remains closed after a reversal; a new approved cycle is required to run again.

## Git checkpoint

Commit and GitHub push are recorded in `docs/STAGE-TRACKER.md` after the stage commits are created.
