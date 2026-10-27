# Stage 13: active role switching

Date: 27 October 2026
Status: complete; committed and pushed to `origin/master` as `31f60c9`
Approval basis: owner instruction to continue to Stage 13 after Stage 12

## Acceptance scope

- A Supabase session starts with the account's primary role and campus.
- The signed-in user can switch only to an explicitly granted role and campus scope.
- Active role context is isolated by Supabase session; another device/session retains its own selection.
- Switching revalidates the grant, reloads portal profile and navigation state, and remounts role-scoped page state.
- A revoked active grant falls back to the primary role on the next portal load.
- A secondary campus-admin grant is not selectable until the campus-scoped policy stage; a primary legacy admin context remains available.

## Implementation

- Added `20261011000000_active_role_contexts.sql` with private session context storage and the `resolve_active_portal_context` / `switch_active_portal_role` RPCs.
- Updated sign-in to enter a portal matching an available membership and initialize that membership as the current session's role context.
- Added the **Active role** selector to the portal top bar. Role/scope changes reload the profile and remount the dashboard page subtree to clear scoped component state.
- The selected role is used for workspace display and route visibility. The current database `my_role()` helper still uses the legacy primary profile role; Stage 15 must migrate protected policies/RPCs before production deployment so the selected role is enforced consistently at the database boundary.
- Campus-scoped secondary Admin switching is held until those policies enforce campus scope. No permissions or school data were seeded.

## Checks

- `node scripts/test-portal.mjs` — PASS. Session default, explicit membership validation, campus admin restriction, per-session isolation, revoked-role fallback, and existing migration/access/report checks.
- `npm run build` — PASS. Existing large JavaScript chunk warning remains (754.51 kB minified).
- `npm run lint` — PASS (exit 0), with existing React effect/hook warnings.
- Browser suite — not run; Playwright Chromium remains unavailable per the baseline.

## Deployment and next stage

- The migration has not been applied to Supabase and the frontend has not been deployed. Stage 15's active-role policy migration must be completed before this UI can be released. Production migration/deployment needs separate owner approval.
- Stage 14 bounds profile loading and recovery; continue in roadmap order.
