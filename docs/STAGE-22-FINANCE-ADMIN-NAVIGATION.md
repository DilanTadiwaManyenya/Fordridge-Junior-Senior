# Stage 22: Finance and Administration navigation

Date: 28 October 2026  
Status: complete; implementation commit `08fa0c4` pushed to `origin/master`

## Acceptance scope

- Replace the generic Management heading with the verified Finance and Administration groups.
- Use Reliance's verified labels for Fordridge features that already exist.
- Keep group headings conditional so a role never sees an empty section.
- Preserve existing role visibility and routes; do not add links for unimplemented features.

## Implementation

- The Finance group contains the existing Finance page, admin Expenses & Cashbook page, and existing external Inventory & POS integration.
- The Administration group contains the existing admin Activity Log and Staff pages.
- Account settings now appears in Workspace, matching its verified feature group.
- Group headings render only when the active role has at least one link in that group.
- No route, permission, database, or external integration behavior changed.

## Checks

- `npm run build` — PASS; existing large JavaScript chunk warning remains.
- `npm run lint` — PASS (exit 0); existing React hook/state and unused-parameter warnings remain.
- `node scripts/test-portal.mjs` — PASS; isolated migration, role, assignment, learner and payment checks pass.
- `git diff --check` — PASS.

The code commit was pushed to GitHub. Hosted frontend deployment and live navigation verification remain pending.
