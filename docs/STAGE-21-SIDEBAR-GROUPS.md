# Stage 21: verified sidebar group labels

Date: 28 October 2026  
Status: complete; verification found the required group labels and routes already in place

## Acceptance scope

- Sidebar group headings match the verified Reliance names for Workspace and Academic services.
- Every internal sidebar destination is an implemented Fordridge portal view.
- The existing Inventory & POS link remains an intentional external integration.
- Fordridge-only or not-yet-built actions are not relabelled as different Reliance features.

## Verification

`src/portal/PortalDashboard.jsx` already renders the exact group headings **Workspace** and **Academic services**. Each internal sidebar route is present in the dashboard view allowlist and has a corresponding render branch. The Inventory & POS item is a separate external link, not a broken internal route.

No product-code change was needed for this stage. Keeping the existing navigation avoids unnecessary churn and preserves its role-based visibility.

The Stage 3 reference confirms the group names and feature labels. Existing **Bulk learner import** remains an import; it is not renamed to **Bulk learner export** because Fordridge does not yet provide the export action. Likewise, unimplemented Course Work, Learning library, rollover and term-locking actions were not added as links.

## Checks

- Source audit of the sidebar destinations, dashboard view allowlist and render branches — PASS.
- `npm run build` — PASS; the existing large JavaScript chunk warning remains.
- `git diff --check` — PASS.

No database migration, production change or frontend deployment was required. Reliance was inspected only through the existing Stage 3 record; its repository was not modified.
