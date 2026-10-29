# Stage 68: POS returns and reconciliation

## Result

Added Main Admin-only partial returns for recorded POS sales. Each return requires a reason, a reported refund method, and one or more sale lines with positive quantities. The database rejects quantities beyond the unreturned sold amount and calculates refunds from the original immutable sale-line prices.

The operator explicitly marks each returned line as saleable or not. Saleable quantities create one positive return movement; items not marked saleable remain in the return history without increasing available stock. The return, return lines, reported refund, any restock movements, and audit event are written in one transaction. Request UUIDs make a retry return the original return receipt without a duplicate refund or stock movement.

Recent sales now show gross sales, reported refunds, net after returns, remaining returnable quantities, and whether any returned items were restocked. The summary keeps USD and ZiG totals separate. Refunds are operator-reported records: Fordridge does not contact a payment processor or verify settlement.

Parent order requests are **not implemented**. Fordridge has not confirmed the parent audience, eligible learners, order/approval workflow, or fulfilment rules. The earlier scope decision keeps parent ordering disabled until those details are confirmed. No parent account or learner data is exposed through POS returns.

## Migration

`supabase/migrations/20261031050000_inventory_pos_returns_and_reconciliation.sql`

The migration adds return headers, immutable return-line snapshots, reported refund records, and stock movement references for restocked returns. Direct writes are revoked and reads are Main Admin-only. It has **not** been applied to production.

## Validation

- `node scripts/test-portal.mjs` passes in isolated PGlite. Stage-specific checks cover partial return, exact price-based refunds, idempotent and altered-payload retries, over-return prevention, saleable versus damaged disposition, stock-restoration quantities, reconciliation totals, transaction atomicity, audit records, direct-write denial, and non-Main-Admin denial.
- `npm run lint -- --quiet` passes.
- `npm run build` passes with the existing large JavaScript chunk warning.
- `node --check scripts/test-portal-browser.mjs` and `git diff --check` pass.
- Browser execution was not rerun because the local browser runner's known Chromium/sandbox limitation remains; returns and reconciliation have not been verified in a live browser.

## Deployment checkpoint

The Stage 65–68 migrations and hosted frontend release remain pending production deployment. No production database or hosted frontend was changed. Parent ordering remains gated on Fordridge confirming audience and workflow. Reported refunds do not establish payment settlement.
