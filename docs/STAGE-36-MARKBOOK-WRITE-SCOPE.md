# Stage 36 — Markbook write scope

Status: Complete; regression checks pushed; no new production migration or feature deployment required

## Review finding

Existing database rules already enforce the Markbook boundary. Teacher class and subject assignment helpers require the active Teacher role and active campus, then match the learner's campus/class/stream and allocated subject. The `record_bulk_marks` RPC applies the subject check per learner. Direct academic-record writes are also limited by row-level policies to the acting teacher's active assignment and subject. Main Admin remains on the separate administrator path.

No authorization defect was found, so this stage adds regression coverage rather than changing access policy.

## Validation

- `node scripts/test-portal.mjs` — passed in isolated PGlite. Covers successful in-scope RPC and direct writes; wrong campus, class, stream, and subject rejection; an unsubjected legacy RPC rejection; active-campus switching; and full rollback when a bulk request mixes an assigned learner with an out-of-scope learner.
- `npm run lint` — passed with existing warnings.
- `npm run build` — passed; existing large JavaScript chunk advisory remains.
- `git diff --check` — passed.

Regression-check commit: [`a62541a`](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/a62541a).

No frontend or database migration change was needed for this review stage. Previously pending production migrations remain unchanged and were not applied.
