# Stage 38 — Fordridge Coursework scope

Status: Scope decision recorded; implementation proceeds in Stage 39

## Decision

Fordridge needs a distinct **Course Work** workspace alongside the general Markbook. The decision follows the approved Fordridge goal of using Reliance's feature names and workflows and the verified reference inventory: Reliance has `CourseWork`, `CourseworkMarks`, and `JuniorCourseWork`, with different junior and senior workspace variants. Fordridge currently has only the general Bulk mark entry screen and a shared progress report.

The first implementation should keep raw assessment marks and maximum scores, preserve teacher subject/class/campus scope, and distinguish coursework from other assessments. It must not invent coursework weights, contribution percentages, assessment counts, term windows, or level-specific grading rules. Those require Fordridge's confirmed academic policy and remain unset.

## Evidence and boundaries

- Reliance reference: [Stage 3 feature and workflow inventory](STAGE-03-RELIANCE-REFERENCE.md), “Coursework and reports” row.
- Existing Fordridge Markbook: `src/portal/BulkMarks.jsx` writes general academic records through `record_bulk_marks`.
- Existing Fordridge reports: `src/portal/ProgressReports.jsx` displays assessment title, subject, date, score, and maximum score, without coursework weighting.
- No Coursework screen or coursework-specific data model exists in the current repository.

## Stage 39 acceptance direction

- Add a distinct Course Work workflow with junior/senior-aware presentation only where existing class-level data can support it.
- Keep assessment results visible in the existing progress/report history.
- Preserve active role, campus, teacher subject/class, and stream boundaries at the database edge.
- Keep calculations limited to raw score and percentage until Fordridge supplies weighting and assessment policy.

This stage changes scope documentation only. No frontend, database, or production change was made.
