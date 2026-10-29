# Stage 61: Expense review and correction

## Result

Added a controlled workflow for the existing Fordridge `cashbook_expenses` ledger. New submissions begin **Pending review**. The Main Admin can approve or reject a pending or legacy row with a required reason, reverse an approved or legacy row with a reason, or correct it by atomically reversing the original and creating a linked pending replacement. Reversal records an accounting correction only; it does not imply or initiate a cash refund.

Existing rows are retained and assigned `legacy_unreviewed`. No historic approval is assumed. A correction replacement is linked through `correction_of`, and the original stays in the ledger as reversed. The shared Income & expenses view deducts only approved expense rows from its net total and reports other statuses separately.

## Access and safeguards

- Page, row-read policies, event-read policy, and all write RPCs require both the active `admin` role and Fordridge's `is_current_main_admin()` check.
- Authenticated clients have read-only access to the cashbook. Direct insert/update/delete is revoked; writes run through audited database functions.
- Submission, review, reversal, and correction accept a request UUID. Repeating the same request returns the original result; reusing that UUID for a different action or payload is rejected.
- Reviews/reversals require a reason; event history stores before/after state, actor, action, and timestamp. The existing Activity Log also records review, reversal, and correction actions.
- Cashbook rows still have no campus attribution, so campus allocation and non-Main-Admin cashbook access remain out of scope.

## Database migration

`supabase/migrations/20261031010000_review_and_correct_cashbook_expenses.sql`

The migration adds review/reversal metadata, append-only client-inaccessible event and idempotency tables, indexes, constraints, and the four Main Admin-only RPCs. It preserves all existing rows. It has **not** been applied to production.

## Validation

- `node scripts/test-portal.mjs` passes in the isolated PGlite harness, including migration application, status transitions, required reasons, duplicate retry behavior, request-ID reuse rejection, atomic correction linkage, legacy reversal, direct-write denial, and Main Admin role restrictions.
- `npm run lint -- --quiet` passes.
- `npm run build` passes with the existing large JavaScript chunk warning.
- `node --check scripts/test-portal-browser.mjs` and `git diff --check` pass.
- Browser execution is blocked in this environment: Playwright's bundled Chromium executable is absent, and launching the installed Chrome explicitly returns `spawn EPERM`. This page has not been browser-verified.

## Deployment checkpoint

Migration application and hosted frontend release remain pending. Do not apply the migration to production until the reviewed production backup is verified and the migration is approved. No production database or deployment action was performed for this stage.
