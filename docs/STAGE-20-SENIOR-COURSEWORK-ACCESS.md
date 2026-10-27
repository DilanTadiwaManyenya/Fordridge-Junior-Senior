# Stage 20: Senior coursework access

Date: 27 October 2026  
Status: complete; implementation commit `923baab` pushed to `origin/master`

## Acceptance scope

- A teacher assigned to a confirmed Senior-campus Sixth Form subject and stream can read and record academic marks only for learners in that assignment.
- The assignment grants no class-register attendance scope.
- A different Sixth Form stream and an unassigned subject remain inaccessible.
- The checks use only synthetic test data; the school's real class, stream, and subject allocations remain unset.

## Implementation

No product-code or database change was required. The existing subject-allocation helper and Markbook RPC already enforce campus, canonical class, stream, and subject together. The isolated PostgreSQL suite now covers a synthetic Sixth Form Biology assignment on one example stream, including allowed and denied learner reads and mark writes.

## Checks

- `node scripts/test-portal.mjs` — PASS; checks assignment-scoped learner reads and Markbook writes against all migrations in isolated PGlite.
- `npm run build` — PASS; existing 761.94 kB minified chunk warning remains.
- `npm run lint` — PASS (exit 0); existing React hook/state and unused-parameter warnings remain.
- `git diff --check` — PASS; Git reports CRLF normalization notices for edited text files.

## Deployment and data

No migration, live database change, or frontend deployment is part of Stage 20. The test class and stream names are fixtures only.
