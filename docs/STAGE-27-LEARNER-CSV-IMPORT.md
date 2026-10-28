# Stage 27 — Learner CSV import

## Deliverable

Kept Fordridge's required CSV columns and added support for quoted commas,
escaped quotes, and multiline fields. Each row is checked locally for field
count, learner name, valid phone, and duplicate phone/admission values within
the file. Zimbabwe local phone numbers are normalized to E.164, matching the
existing account-provisioning function.

The screen shows CSV row numbers, normalized phone numbers, validation issues,
and a review table before any account request is sent. Invalid rows block
creation. The preview is local-only; account provisioning begins only when the
administrator confirms. Existing-account conflicts remain checked by the
existing account service. Files are limited to 5 MB and 500 learner rows.

## Validation

- `node scripts/test-learner-import.mjs` — passed for quoted commas, escaped
  quotes, multiline fields, line numbers, invalid fields, duplicates, and
  malformed CSV.
- `npm run build` — passed. Existing large-bundle warning remains
  (767.70 kB JavaScript output).
- `npm run lint` — passed with existing repository warnings; targeted lint for
  the changed import and test files passed without warnings.
- `node scripts/test-portal-browser.mjs` using installed Chrome — passed. It
  confirms the preview sends no account request before confirmation and that
  the confirmed request contains the correctly parsed values and normalized
  phone.
- `git diff --check` — passed.

## GitHub and deployment

- Code commit: `dfee5a4c560a0e598b599aed11805d2e1e9c7056`
- Author: `DilanTadiwaInnoJuniorManyenya <dilantadiwamanyenya@gmail.com>`
- Pushed to the verified `origin/master` branch.
- Hosted frontend deployment remains pending; no production deployment was
  performed in this stage.

## Next

Stage 28 adds bulk learner export with scoped records and safe spreadsheet cell
handling.
