# Stage 15: active-role authorization boundary

Date: 27 October 2026
Status: implementation validated; awaiting stage commit and push
Approval basis: owner-approved 85-stage roadmap and the user's “next” instruction after the Stage 15 approval request

## Acceptance scope

- Direct database authorization resolves the selected role only from the signed-in session's active context and a matching server-controlled membership.
- Role and campus helpers fall back to the primary membership when no valid active context exists.
- A selected Accountant or Principal does not inherit permissions from the account's primary role.
- A campus-scoped Admin membership cannot be used as a school-wide Main Admin. Campus Admin selection and privileged routes remain unavailable until the roadmap adds the matching campus-scoped feature policies.
- Route checks use the active role; campus-scoped Admin contexts render as a restricted staff workspace while their scoped capabilities are pending.

## Implementation

- Added `20261012000000_active_role_authorization.sql` with `Principal` and `Accountant` enum values and active-context-aware `my_role()` / `my_campus_id()` helpers.
- Updated the role switch RPC to reject every campus-scoped Admin context until scoped policies are implemented.
- Updated portal context handling so an Admin membership scoped to a campus cannot reach Main Admin-only pages by entering a direct route. All campus Admin choices are visibly disabled with the existing scoped-access-pending label.
- Kept role grants, school data, class/stream catalogue entries and the Reliance repository untouched. The migration does not update existing rows or drop objects.

## Checks

- `node scripts/test-portal.mjs` — PASS. Covers migrations, direct active-role authorization, Accountant non-inheritance of finance access, campus scope, memberships and existing portal policy regressions.
- `npm run build` — PASS. Existing large JavaScript chunk warning remains (755.12 kB minified).
- `npm run lint` — PASS (exit 0); existing React effect/hook and unused-parameter warnings remain.
- `git diff --check` — PASS.
- Browser suite — not run; Playwright Chromium remains unavailable per the Stage 5 baseline.

## Deployment and limits

- The new migration is not applied to Supabase; the frontend is not deployed. Production migration and deployment require separate owner approval.
- Campus Admin is intentionally still restricted. Its authorized campus-specific administration features must be implemented and tested before enabling it.
- Principal and Accountant are recognized as active identities, but their specific capabilities remain disabled until their respective roadmap stages.
