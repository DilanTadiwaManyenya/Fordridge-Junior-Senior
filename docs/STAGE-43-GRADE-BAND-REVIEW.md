# Stage 43 — Grade-band review by school level

Status: Existing behavior reviewed; awaiting Fordridge-approved Junior and Senior scales

## Verified in Fordridge

- `report_grade_bands` stores a campus, minimum and maximum percentage, grade, and optional descriptor. It has no school-level, class-level, or scale-version field.
- The Grade bands page configures ranges by campus only. The report preview matches bands by campus and uses inclusive minimum/maximum comparisons. The released report snapshot calculation also uses inclusive `BETWEEN`, choosing the matching row with the greatest minimum percentage.
- Database checks constrain endpoints to 0–100 and require maximum >= minimum. They do not prevent overlaps or gaps, or require a complete scale. If ranges overlap, the highest minimum wins; the same rule is used by the preview and snapshot calculation.
- The isolated portal suite currently inserts a generic 0–100 test band for snapshot coverage. It does not verify school-approved thresholds or Junior/Senior boundaries.
- The report preview still says to confirm the official Fordridge grading scale before issuing formal reports. No approved Junior/Senior percentage-to-grade matrix was found in Fordridge's tracked documentation.

## Decision needed before changing grade logic

Do not infer official cutoffs from sample data or another school's configuration. No grading ranges, descriptors, report calculation, or production data were changed in this review.

To complete level-specific verification, Fordridge needs to confirm for each school level:

1. Which confirmed class/form names use the Junior scale and which use the Senior scale.
2. Every grade label, minimum and maximum percentage, and descriptor for each scale.
3. Whether boundaries are inclusive at both ends, and the approved handling of any gaps, overlaps, or decimal precision.
4. Whether grade bands apply at campus level or may vary by campus as well as school level.

Once these rules are provided, Stage 43 can test values immediately below, at, and above every boundary against both the report preview and released snapshot calculation. Until then, level-specific implementation and Stage 44 remain pending in roadmap order.

## Validation

- Source/schema review covered the Grade bands editor, report preview matcher, snapshot grade query, and grade-band migration constraints.
- `node scripts/test-portal.mjs` — passed as a baseline. Its generic 0–100 fixture does not assert Junior/Senior scales or boundary examples.
- `git diff --check` — passed.
