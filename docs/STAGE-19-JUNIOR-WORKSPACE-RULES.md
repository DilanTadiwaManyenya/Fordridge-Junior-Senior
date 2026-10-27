# Stage 19: Junior ECD and Grade workspace rules

Date: 27 October 2026  
Status: complete; implementation commit `4b562a1` pushed to `origin/master`

## Acceptance scope

- A Junior teacher with a class-register assignment can use **My class** for the assigned class scope.
- ECD and Grade class labels are handled by the same campus/class/stream matching rules as other Fordridge class labels.
- Whole-class assignments show learners in the assigned class; stream assignments show only learners in the assigned stream.
- Subject-only allocations do not become class-register scopes. They remain in **Subject allocations**.
- No real class, stream, or learner allocation is created by this stage. Test-only examples prove behavior without asserting the school's class catalogue.

## Implementation

The existing Stage 18 teacher workspace already treats class labels generically and relies on assignment kind plus campus/class/stream scope. This stage adds regression coverage for an ECD whole-class scope and a Grade 3 stream scope, including the teacher-entry capability. No production code or database migration was needed because the existing implementation satisfies the Stage 19 behavior.

The test fixtures are synthetic and do not define the school's grade list, stream allocation, or learner records.

## Checks

- `node scripts/test-portal.mjs` — PASS, including the existing isolated policy, payment, report, and assignment suite.
- `npm run build` — PASS; existing 761.94 kB minified chunk warning remains.
- `npm run lint` — PASS (exit 0); existing React hook/state and unused-parameter warnings remain.
- `git diff --check` — PASS; Git reports existing CRLF normalization notices for edited text files.

## Deployment and data

No migration, live database change, or frontend deployment is part of Stage 19. Real classes, streams, and allocations remain unset until school confirmation.
