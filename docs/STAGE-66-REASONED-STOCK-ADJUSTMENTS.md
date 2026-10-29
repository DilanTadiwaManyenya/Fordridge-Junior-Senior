# Stage 66: Reasoned stock adjustments

## Result

Added a Main Admin stock-correction workflow to Fordridge's native Inventory & POS page. Administrators can enter a signed whole-number adjustment against a single-balance product or a specific active variant, see the resulting balance, and provide a required reason. The page shows each adjustment's timestamp, product/variant, signed change, before/after balance, reason, and actor.

Adjustments are appended to the stock movement ledger and cannot be edited through client access. The backend serializes adjustments with receipt writes, rejects a result below zero, and makes retries idempotent by request UUID and payload. Invalid or mismatched retries cannot silently create another correction. Only the active Main Admin can read or create adjustments.

## Migration

`supabase/migrations/20261031030000_reasoned_inventory_stock_adjustments.sql`

The migration adds an adjustment record with a required reason and before/after quantities, extends stock movements to reference either a receipt line or adjustment, and adds the `adjust_inventory_stock` RPC. It preserves prior receipt movements and does not seed or alter school stock balances. It has **not** been applied to production.

## Validation

- `node scripts/test-portal.mjs` passes in isolated PGlite. Stage-specific coverage includes zero/invalid adjustments, reason validation, positive and negative changes, variant adjustments, idempotent retries, payload mismatch, negative-balance rejection, movement reconciliation, audit entries, direct-write denial, and teacher access denial.
- `npm run lint -- --quiet` passes.
- `npm run build` passes with the existing large JavaScript chunk warning.
- `node --check scripts/test-portal-browser.mjs` and `git diff --check` pass.
- Browser execution remains unverified because Playwright's bundled Chromium is absent and installed Chrome launch is blocked by sandbox `spawn EPERM`.

## Deployment checkpoint

The Stage 65 and 66 migrations and frontend release remain pending production deployment. No production database or hosted frontend was changed. The next roadmap stage is 67: safe POS checkout, which must keep sale/payment/stock changes atomic and retry-safe.
