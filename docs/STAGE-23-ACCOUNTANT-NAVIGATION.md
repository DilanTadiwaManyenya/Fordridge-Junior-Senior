# Stage 23: role-specific Accountant navigation

Date: 28 October 2026  
Status: complete; implementation commit `22848b4` pushed to `origin/master`

## Acceptance scope

- Accountant navigation opens the authorised finance workspace.
- Accountant sees only the finance/support links currently permitted by the approved matrix and implemented in Fordridge.
- Existing direct-route and database authorization remain unchanged.

## Implementation

- Added a pure role-filtered finance navigation model used by the portal sidebar.
- Accountants receive an **Accountant workspace** group containing only the existing **Finance** page.
- Expenses & Cashbook remains Main Admin-only because current rows have no safe campus attribution.
- Inventory & POS remains visible only to the existing Staff and Main Admin roles; Accountant access is not inferred.
- The general Workspace and Account settings links remain available as before.

## Checks

- `node scripts/test-portal.mjs` — PASS; new assertions cover Accountant, Main Admin, Staff and Teacher finance navigation, in addition to the isolated database suite.
- `npm run build` — PASS; existing large JavaScript chunk warning remains.
- `npm run lint` — PASS (exit 0); existing React hook/state warnings and an unused test fixture warning remain.
- `git diff --check` — PASS.

No database migration or production data change was required. Code is pushed to GitHub; hosted frontend deployment and live Accountant sign-in verification remain pending.
