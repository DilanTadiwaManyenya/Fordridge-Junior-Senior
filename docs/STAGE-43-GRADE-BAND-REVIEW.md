# Stage 43 — Grade bands by school level

Status: Implemented and locally verified. Production migration and frontend release are pending.

## Owner decision

The owner directed Fordridge to follow Reliance's grade sequence for now, with the option to change it later. These thresholds and labels are provisional reference defaults, not a declaration of permanent Fordridge policy. No Reliance school records, accounts, credentials, or environment values were copied.

## Delivered

- Added three independent scales: Junior ECD/Primary, Senior O Level, and Senior A Level.
- Mapped ECD and Grade labels to Junior; Form 1–4 to O Level; and Lower/Upper Six, Sixth Form, and A Level 1/2 labels to A Level. Unknown class labels continue to use Fordridge's existing campus-only legacy bands.
- Seeded the 21 Reliance reference bands as global defaults. A campus can edit a local override without changing another campus's scale. Existing campus-only legacy rows are preserved.
- Matched percentage boundaries against whole-number Reliance thresholds by flooring fractional percentages for mapped levels. For example, 84.99% follows the 84 threshold. Legacy fallback retains its prior inclusive-range calculation.
- Added a boundary checker, complete-scale validation (whole-number limits covering 0–100 without gaps or overlaps), and reason-required administrator saves through an audited RPC with optimistic concurrency checks.
- Removed direct authenticated table writes to grade bands; changes must use the validated save function.
- Updated the report preview, readiness checks, publication preflight, and newly created release snapshot grades to use the learner's level-specific scale.
- Existing issued report snapshots are not recalculated. No production records were changed.

## Provisional Reliance sequences

| Group | Minimum thresholds and outcomes |
| --- | --- |
| Junior ECD/Primary | 85 Unit 1; 77 Unit 2; 70 Unit 3; 60 Unit 4; 50 Unit 5; 40 Unit 6; 30 Unit 7; 20 Unit 8; 0 Unit 9 |
| O Level | 75 A; 65 B; 50 C; 40 D; 0 E |
| A Level | 80 A; 70 B; 60 C; 50 D; 40 E; 30 O; 0 F |

Each band has an inclusive integer range, points, and descriptor stored in the migration and editable in the Grade bands screen.

## Validation

- `node scripts/test-grade-bands.mjs` — passed 5 checks for level mapping, boundaries, campus/global/legacy precedence, and complete scale validation.
- `node scripts/test-portal.mjs` — passed isolated PGlite migration, policy, RPC, and portal regression suite.
- `npm run lint` — passed with the repository's existing warnings.
- `npm run build` — passed; Vite reports the existing large JavaScript chunk warning.
- `node scripts/test-portal-browser.mjs` with the installed Chrome executable — passed; grade threshold preview and audited scale save were exercised with mocked backend requests.
- `git diff --check` — passed.

## Release state and next stage

Migration `20261029140000_level_grade_bands.sql` has not been applied to production. The frontend has not been deployed. Production database changes and hosted deployment remain subject to the separate approval gate. Stage 44's level-aware report variants are recorded in [Stage 44](STAGE-44-PROGRESS-REPORT-VARIANTS.md); Stage 45 (printed report layout) is next in roadmap order.
