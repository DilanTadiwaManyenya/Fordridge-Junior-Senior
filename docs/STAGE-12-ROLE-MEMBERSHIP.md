# Stage 12: safe role membership storage

Date: 27 October 2026
Status: complete; committed and pushed to `origin/master` as `e8afb27`
Approval basis: owner approval of the 85-stage roadmap, Stage 7 access matrix, and instruction to continue Stage 12

## Acceptance scope

- Existing `profiles.role` values remain intact and are backfilled as each account's primary membership.
- A user may hold additional roles only through a server-controlled grant; campus scope, actor, reason and timestamp are stored.
- Users may read their own memberships. Main Admin may read all memberships. No client may directly insert, update or delete a membership.
- Main Admin grant/revoke/primary-role operations reject self-management, require a reason and write the action to the existing audit trail.
- Public signup continues to allow only Student or Parent and creates a matching primary membership.
- Admin account provisioning synchronizes the temporary signup role with the provisioned Teacher/Staff/Student role and requires Main Admin authority.
- Existing authorization remains based on Fordridge's current `profiles.role`; no role switch or permission expansion is introduced in this stage.

## Implementation

- Added `20261010000000_role_membership_storage.sql` with `user_role_memberships`, legacy-role backfill, one-primary-role and unique-scope constraints, read-only RLS, and authenticated grant/revoke/primary-provisioning RPCs.
- Added Main Admin detection from the user's primary school-wide `admin` membership. Campus Admin remains an `admin` membership scoped to its campus; it cannot grant roles through these school-wide grant RPCs. Secondary memberships remain stored but inactive until Stage 13.
- Added audit events for role grants, revocations and primary-role provisioning. Primary roles must be changed through the protected provisioning RPC; additional memberships can be explicitly revoked.
- Updated the protected signup trigger and `create-portal-account` Edge Function to keep role memberships synchronized with the profile and require Main Admin for account provisioning.
- Did not seed any actual accounts or copy Reliance users, credentials or configuration.

## Checks

- `node scripts/test-portal.mjs` — PASS. Legacy profile backfill; signup role limits and synchronization; self-only membership reads; direct-write rejection; Main Admin grant/revoke/provisioning; self-grant, non-Main-Admin grant and primary-role revoke denial; secondary Main Admin remains inactive; audit records; existing portal authorization and report assertions.
- `npm run build` — PASS. Existing large JavaScript chunk warning remains (752.53 kB minified).
- `npm run lint` — PASS (exit 0), with existing React effect warnings and the existing BulkMarks missing-dependency warning.
- Browser suite — not run; Playwright Chromium remains unavailable per the baseline.

## Deployment and next stage

- The migration has not been applied to Supabase and the Edge Function has not been deployed. Production migration/deployment needs separate owner approval.
- Stage 13 adds active-role switching. It must validate membership and reset scoped state; it must not combine permissions from multiple roles. Review it separately before implementation because it changes permission selection at sign-in/runtime.
