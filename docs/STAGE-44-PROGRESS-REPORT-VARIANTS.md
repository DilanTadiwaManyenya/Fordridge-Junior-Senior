# Stage 44 — Live progress report variants

Status: Implemented and locally verified; hosted frontend release pending.

## Reliance reference and Fordridge boundary

Reliance separates Junior reports, Senior reports, and Sixth Form reporting. Fordridge's live report store currently has subject, assessment title/type, date, score, maximum score, year, term, and learner class/stream. It does not store Junior developmental ratings, Paper 1/Paper 2 components, separate term/exam marks, or school-approved Sixth Form subject weighting. This stage reflects the class-level variants while showing only existing Fordridge fields. It adds no inferred academic policy or Reliance records.

## Delivered

- ECD/Grade learners see **Junior progress report** with the learning-area/assessment column.
- Form 1–4 learners see **Senior progress report**.
- Lower/Upper Six, Sixth Form, and mapped A Level learners see **Sixth Form progress report** and the provisional Stage 43 A Level grade sequence.
- Unmapped class labels receive a general report title and a review note rather than a guessed school-level format.
- Valid Markbook score percentages are averaged equally per assessment, consistent with the current Fordridge report and snapshot calculation. Course Work remains visible in the assessment list but excluded from the average. Incomplete/invalid marks are excluded; displayed assessment percentages use one decimal place.
- The report explains which variant is shown and avoids suggesting that missing paper, developmental, weighting, or aggregate-point fields were calculated.
- Issued report snapshots, report-release behavior, and the database schema were not changed.

## Validation

- `node scripts/test-progress-report-variants.mjs` — passed Junior/Senior/Sixth Form mapping, unmapped fallback, class-level grade outcomes, average calculation, Coursework exclusion, and incomplete-mark handling.
- `node scripts/test-grade-bands.mjs` — passed 5 Stage 43 grade-scale checks.
- `node scripts/test-portal.mjs` — passed the isolated PGlite portal regression suite.
- `npm run lint` — passed with existing repository warnings.
- `npm run build` — passed; Vite reports the existing large-bundle warning.
- `node scripts/test-portal-browser.mjs` with installed Chrome — passed mocked Senior, Junior, and Sixth Form live report flows and Coursework exclusion.
- `git diff --check` — passed.

## Release state and next stage

No database migration is needed for Stage 44. The updated frontend has not been deployed. Stage 45 (printed report layout) follows next; that stage can review page composition and print behavior without changing report calculations or historical snapshots.
