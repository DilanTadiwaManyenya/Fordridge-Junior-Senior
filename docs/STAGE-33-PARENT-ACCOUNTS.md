# Stage 33 — Parent account directory

Status: Implemented, validated, and pushed; hosted frontend deployment pending

## Scope

Added an administrator-only, read-only Parent accounts page. It lists registered parent profiles only when a `student_guardians` relationship exists, and displays each linked learner's name, campus, admission number, class/stream, and non-active enrolment status when present. Search matches parent name/phone and linked learner name/admission number/class/stream/campus.

The page does not create accounts, issue or reveal credentials, or add/remove guardian relationships. Staff must verify a relationship through the school office and use the existing learner profile workflow to change it. No database schema or production migration was added.

## Validation

- Targeted Oxlint on `ParentAccounts.jsx`, `PortalDashboard.jsx`, and the browser workflow — passed with existing React effect warnings.
- `git diff --check` — passed.
- `npm run build` — passed; Vite reported the existing large JavaScript chunk advisory.
- `scripts/test-portal-browser.mjs` — passed in Chrome with mocked backend requests. Covers linked parent visibility, exclusion of unlinked parents, learner-field search and empty state, absence of relationship-edit controls, and direct-route denial for a parent role.

## Deployment

Code commit: [`51f5dee`](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/51f5dee).

No database or backend deployment is needed for this stage. The frontend is not deployed yet; deployment remains a later roadmap checkpoint.
