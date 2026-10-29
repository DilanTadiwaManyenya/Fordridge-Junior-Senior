# Stage 65: Auditable stock receipts

## Result

Added a Fordridge-native **Inventory & POS** page for the Main Admin to create empty product records, add optional variants, and record supplier deliveries or opening stock. The previous external destination remains available as **External Inventory & POS** for staff and Main Admin; no connection to it was attempted.

New products and variants begin with no stock. The migration seeds no products, categories, SKUs, sizes, campus assignments, prices, or quantities. The product form requires a school-entered stock unit. A supplier receipt requires a supplier and a known unit cost/currency per line; opening stock requires a reason and can explicitly leave historical unit cost unknown.

Each receipt line snapshots product name, variant label, stock unit, quantity, and any known cost. A positive stock movement is recorded in the same transaction with its source, actor, reason, and time. Displayed stock is the sum of receipt movements; users cannot directly edit a stock quantity. Request IDs make product creation, variant creation, and receipts retry-safe.

## Access and scope

- The internal page, catalogue read policies, receipt history, and all three write RPCs require both active `admin` and `is_current_main_admin()`.
- Products, variants, receipts, lines, and movements are readable by Main Admin only. Authenticated client DML is revoked; stock enters through the receipt RPC.
- This stage does not enable checkout, sales, payment processing, campus allocation, inventory allocation, or parent ordering.
- The existing external Inventory & POS link is retained as a separate service.
- This stage uses Fordridge's USD and ZiG labels for recorded costs. A blank opening-stock cost is represented as unknown rather than zero.

## Migration

`supabase/migrations/20261031020000_inventory_stock_receipts.sql`

The migration creates an empty product/variant foundation, idempotency records, stock receipt/line tables, and a stock-movement ledger, plus three Main Admin-only RPCs. It does not read, import, or alter existing school inventory because no local inventory schema or stock records existed. It has **not** been applied to production.

## Validation

- `node scripts/test-portal.mjs` passes in isolated PGlite. Added cases cover product/variant creation retries, variant-mode enforcement, receipt input validation, supplier deliveries, reasoned opening stock, unknown historic cost, immutable stock movement writes, snapshots, audit entry, atomic rollback of a failed multi-line receipt, and teacher denial.
- `npm run lint -- --quiet` passes.
- `npm run build` passes with the existing large JavaScript chunk warning.
- `node --check scripts/test-portal-browser.mjs` passes.
- `git diff --check` passes.
- Browser execution could not be completed: Playwright's bundled Chromium is absent and launching installed Chrome is blocked by sandbox `spawn EPERM`. The new page has not been browser-verified.

## Deployment checkpoint

The production migration and hosted frontend release remain pending. No production database, external POS service, or deployment was changed. Before real stock is entered, the school must supply confirmed product names, unit labels, variant labels, supplier delivery details, and any known costs. Campus and selling-role scope must be confirmed before checkout is developed.
