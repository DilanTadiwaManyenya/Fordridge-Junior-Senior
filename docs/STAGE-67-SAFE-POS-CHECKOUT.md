# Stage 67: Safe POS checkout

## Result

Added Fordridge-native checkout for the existing Main Admin inventory workspace. Selling prices are entered explicitly per product and remain unset for new catalogue records. Product variants inherit their product's price. A checkout can contain 1–50 distinct product/variant lines, must use one configured currency, and is rejected when a line has insufficient stock.

Checkout calculates the total from current database prices. In one database transaction it creates the sale and immutable line snapshots, records one operator-reported payment for the exact total, deducts stock through negative ledger movements, and writes an audit event. If any validation or write fails, the sale, payment, and all stock changes roll back together. Request UUIDs make uncertain retries return the original receipt without a second sale or deduction.

Payment method is captured as text reported by the operator. Fordridge does not process a payment, connect a gateway, or verify settlement. POS sales remain separate from learner fee transactions and expenses. Access remains Main Admin-only until Fordridge approves a cashier role and scope. No campus or other location is inferred.

## Migration

`supabase/migrations/20261031040000_atomic_inventory_pos_checkout.sql`

The migration adds nullable selling-price/currency fields, a Main Admin price-update RPC, sale and line snapshot tables, operator-reported payment records, sale stock movements, and the atomic checkout RPC. It leaves all existing products without prices, and seeds no school pricing, products, payments, or stock. It has **not** been applied to production.

## Validation

- `node scripts/test-portal.mjs` passes in isolated PGlite. Stage-specific checks cover unset initial prices, price authorization/validation/idempotency, successful checkout with product and variant lines, price and total snapshots, one exact operator-reported payment, stock deductions, retry without duplicate sale, altered-payload rejection, insufficient-stock and duplicate-line rejection, mixed-currency rejection, audit history, and non-admin denial.
- `npm run lint -- --quiet` passes.
- `npm run build` passes with the existing large JavaScript chunk warning.
- `node --check scripts/test-portal-browser.mjs` and `git diff --check` pass.
- Browser execution was not rerun because the local browser runner's known Chromium/sandbox limitation remains; the new checkout screen has not been verified in a live browser.

## Deployment checkpoint

The Stage 65–67 migrations and hosted frontend release remain pending production deployment. No production database or hosted frontend was changed. Product prices, currency choices, payment-method labels, and the Main Admin-only access boundary still require operational confirmation before real sales. Partial payments, discounts, tax, change-making, processor integration, cashier roles, campus stock, parent orders, and returns are outside this stage.
