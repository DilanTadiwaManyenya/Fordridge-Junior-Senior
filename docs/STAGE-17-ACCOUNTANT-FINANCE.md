# Stage 17: campus-scoped Accountant fee operations

Date: 27 October 2026
Status: implementation validated; awaiting stage commit and push
Approval basis: owner-approved Stage 7 matrix allows Accountants to record payments in their assigned campus; reversals and deletions stay with Main Admin by default.

## Acceptance scope

- An Accountant's active campus scopes the fee records and payment history returned by RLS and the finance RPC.
- An Accountant may record an idempotent fee payment only against a fee record in that active campus.
- An Accountant may read the shared fee schedule but cannot change settings, create fee charges, directly edit fee records, write transactions outside the payment RPC, reverse payments, or access unscoped Expenses & Cashbook entries.
- Existing Main Admin payment behavior and its retry protections remain intact.

## Implementation

- Added `20261014000000_accountant_campus_fee_payments.sql` with campus-scoped fee and transaction SELECT policies, read-only fee schedule access, and a narrow Accountant fee-record RPC.
- Extended `record_fee_payment` to permit the active Accountant role only after verifying campus scope, including before returning an idempotent retry. Other roles and out-of-campus fee IDs are rejected. Existing payment validation, transaction auditing, and duplicate-request protection remain in force.
- Added the Accountant to the Finance route and existing fee dashboard. Accountants see the active-campuses fee schedule and payment ledger, and can record a payment. Fee creation and settings controls remain Main Admin-only.
- Left reversals and cashbook access unavailable. The cashbook does not store campus attribution, so scoped access cannot yet be enforced safely.

## Checks

- `node scripts/test-portal.mjs` — PASS. Covers allowed campus payment, actor attribution, idempotent retry, cross-campus payment rejection, campus-limited reads, role isolation, fee-charge/settings/transaction write denial, cashbook isolation and existing regression assertions.
- `npm run build` — PASS. Existing large JavaScript chunk warning remains (757.69 kB minified).
- `npm run lint` — PASS (exit 0); existing React effect/hook warnings remain.
- `git diff --check` — PASS.
- Browser suite — not run; Playwright Chromium remains unavailable per the Stage 5 baseline.

## Deployment and limitations

- Migration is not applied to Supabase and the frontend is not deployed; production migration/deployment require separate approval.
- Accountant expense entry/reconciliation, inventory checkout, exports and reversals remain disabled until their required scoped models, separation-of-duties rules and explicit grants are implemented.
- Campus-scoped cashbook access needs an approved way to attribute existing rows; no campus was inferred or backfilled.
