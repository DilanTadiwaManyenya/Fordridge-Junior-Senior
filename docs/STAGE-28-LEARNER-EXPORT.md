# Stage 28 — Bulk learner export

## Deliverable

Added a CSV export action to the Learners directory. It exports only the
records currently visible after the search filter, and is disabled while data
is loading, after a load error, or when the filter has no matching learners.
The export is not shown in the Staff directory.

The CSV includes learner UUID, name, phone, admission number, class, stream,
enrolment status, and campus. CSV quoting protects commas, quotes, and line
breaks. Formula-like values receive a spreadsheet text prefix, and UUIDs,
phone numbers, and admission numbers are marked as text to preserve their
contents and leading zeroes in spreadsheet software.

## Validation

- `node scripts/test-learner-export.mjs` — passed for CSV quoting,
  formula-injection neutralization, and text preservation.
- `npm run build` — passed. Existing large-bundle warning remains
  (769.04 kB JavaScript output).
- `npm run lint` — passed with existing repository warnings.
- `node scripts/test-portal-browser.mjs` using installed Chrome — passed. The
  browser confirms export download, text-marked learner/admission IDs, and a
  disabled export when the current filter has no results. All backend calls
  were mocked.
- `git diff --check` — passed.

## GitHub and deployment

- Code commit: `f3321b04e98a547866640941aa661b366217e31c`
- Author: `DilanTadiwaInnoJuniorManyenya <dilantadiwamanyenya@gmail.com>`
- Pushed to the verified `origin/master` branch.
- Hosted frontend deployment remains pending; no production deployment was
  performed in this stage.

## Next

Stage 29 adds learner roster filters for class and active/inactive status.
