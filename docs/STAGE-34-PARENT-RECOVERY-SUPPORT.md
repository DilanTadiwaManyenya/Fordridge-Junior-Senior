# Stage 34 — Parent access recovery support

Status: Implemented, validated, and pushed; production migration and hosted frontend deployment pending approval/deployment

## Scope

Added an administrator support flow to the Parent accounts directory. It guides staff to the existing Parent portal self-service password reset: use the registered phone, verify the one-time SMS code, and choose a private new password. Staff cannot view, send, or set a reusable password in this workflow.

Before the action can be recorded, the operator must attest that they verified the requester through the school-approved process and provided the guidance. The versioned RPC independently requires the active school-wide Main Admin role, a parent profile with an existing learner link, and the identity-verification attestation. It records actor, parent account, action, recovery method, and that no reusable credential was shared. It stores no phone, SMS code, password, or operator note.

Migration: `20261028130000_parent_recovery_support.sql`.

## Validation

- `node scripts/test-portal.mjs` — passed in isolated PGlite. Verifies a linked parent can be recorded by Main Admin, audit details contain no credentials, and unlinked parents, unverified requests, non-admins, and anonymous execution are rejected.
- Targeted Oxlint — passed with existing React effect and unused-variable warnings.
- `npm run build` — passed; existing large JavaScript chunk advisory remains.
- `scripts/test-portal-browser.mjs` — passed in Chrome with mocked backend requests. Verifies identity confirmation is required, instructions use SMS self-service, no password input is present, and the RPC is called with the expected parent and attestation.
- `git diff --check` — passed.

## Deployment

Code commit: [`73a21f6`](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/73a21f6).

The migration is versioned locally and pushed to GitHub; it has not been applied to production. Production migration approval and frontend deployment remain pending.
