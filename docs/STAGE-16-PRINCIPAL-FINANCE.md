# Stage 16: Principal read-only finance

Date: 27 October 2026
Status: complete; implementation commit `caf9461` pushed to `origin/master`
Approval basis: owner-approved Stage 7 access matrix (Principal Finance is read-only within the assigned campus)

## Acceptance scope

- A Principal can open Finance by direct route and sees read-only fee records for the active campus.
- A Principal can read the shared Fordridge fee schedule and relevant campus fee records/payment ledger.
- Principal database access does not include another campus, finance writes, fee changes, or payment RPCs.
- Principal access does not expose the existing cashbook because those entries have no campus attribution.

## Implementation

- Added `20261013000000_principal_finance_read_only.sql` with SELECT-only RLS policies for the fee schedule and campus-scoped fee records and transactions.
- Added `principal_finance_fee_records()` as an authenticated, Principal-only, campus-scoped RPC. It returns only fee summary fields, campus labels, and learner name; profile RLS remains unchanged.
- Added Principal Finance navigation and a read-only fee schedule to the existing Fees dashboard. Admin-only payment, fee creation, and settings-edit controls remain unchanged.
- Added a campus-filtered read-only recent-payment ledger; the Principal API role can read transactions only for its active campus.
- Kept Expenses & Cashbook closed to Principals. `cashbook_expenses` has no `campus_id`; granting read access would expose unscoped school-wide financial entries. No campus values were guessed or backfilled.

## Checks

- `node scripts/test-portal.mjs` — PASS. Covers active Principal role, campus filtering, the restricted RPC field list, anonymous RPC denial, fee-setting read-only behavior, payment/create RPC denial, direct fee and transaction write denial, and cashbook isolation.
- `npm run build` — PASS. Existing large JavaScript chunk warning remains (756.25 kB minified).
- `npm run lint` — PASS (exit 0); existing React effect/hook and unused-parameter warnings remain.
- `git diff --check` — PASS.
- Implementation commit `caf9461` — pushed to the verified Fordridge remote.
- Browser suite — not run; Playwright Chromium remains unavailable per the Stage 5 baseline.

## Deployment and limitations

- Migration is not applied to Supabase and the frontend is not deployed; production migration/deployment require separate approval.
- Cashbook read access requires a separately reviewed campus attribution design for current and future records.
