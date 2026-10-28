# Stage 37 — Bulk mark validation

Status: Implemented and locally verified; production migration and frontend release pending

## Changes

- Added `20261028150000_bulk_mark_validation.sql` to validate assessment title, subject, positive maximum score, date/year agreement, non-future dates, valid term, learner identifiers, numeric scores, score bounds, and duplicate learner rows before writing.
- Bulk writes now reject an assessment already recorded for any learner in the submitted set. Learner profile rows are locked in stable ID order while validating and saving so concurrent retries cannot both pass the duplicate check.
- Updated Bulk mark entry to validate marks and dates before submission, cap the date picker at today, and give clear feedback for a date/year mismatch or out-of-range mark.
- Added isolated database regressions for duplicate assessments, repeated learners in one batch, missing marks, future dates, mismatched years, and invalid terms.

The date rule follows the existing UI's calendar-year field: an assessment date must be on or before today's date in the Fordridge timezone (Africa/Harare) and its year must equal the selected academic year. No term-specific date windows were added because Fordridge's approved term calendar is not recorded in the repository.

## Validation

- `node scripts/test-portal.mjs` — passed in isolated PGlite, including migration application and the new rejection cases.
- `npm run lint` — passed with existing repository warnings, including hook/effect warnings in BulkMarks and other screens.
- `npm run build` — passed; existing large JavaScript chunk advisory remains.
- `git diff --check` — passed.

The migration has not been applied to production and the frontend has not been deployed. The migration performs no cleanup or destructive data operation. Its duplicate guard prevents repeat writes through the bulk RPC; it does not add a uniqueness constraint for separate direct SQL inserts.
