# Stage 64: Inventory catalogue design

## Scope

This stage defines the conceptual design for a Fordridge-native catalogue, following Reliance's product/variant workflow. Stage 65 implements only the empty product/variant foundation required by stock receipt entry. This document itself does not create database objects, product records, settings, or permissions.

## Proposed catalogue model

| Record | Purpose | Initial design |
| --- | --- | --- |
| Product | A sellable or stock-tracked catalogue item | School-entered name, optional SKU/description/category, active/archived state, stock unit, and explicitly configured selling price/currency |
| Product variant | A distinct stock-counting option belonging to one product | Optional size label for uniform-style items; unique within that product; inherits product stock unit and price until a school-approved pricing rule says otherwise |
| Stock movement | An auditable quantity change | Future receipts, adjustments, sale deductions, and reversals record quantity delta, actor, reason/source, timestamp, and product/variant reference |

Products without variants keep one balance. Variant-controlled products hold balances on their variants; the product total is a derived sum and must not be independently editable. Every quantity uses the product's configured stock unit (for example, each/pair/set only after the school confirms its units). Fractional units are out of scope unless Fordridge requires them.

The stock-movement ledger is the proposed source of truth. A cached balance may be added later for efficient display, but it must be updated in the same transaction and reconcile to movements. Directly editing a displayed quantity is not the adjustment workflow.

## Data and history safeguards

- No class, stream, campus, product, category, SKU, variant, size, stock, cost, price, or currency values are seeded or inferred.
- Campus/location is not placed on catalogue records until Fordridge confirms whether Junior and Senior maintain separate inventory and provides the allocation rule. Existing school class/stream configuration remains unset.
- A variant belongs to one product and cannot be moved between products. Hiding a variant stops new sales while historical lines retain the exact saved label.
- Product/variant names, identifiers, stock unit, quantity, currency, unit price, and any confirmed unit cost must be snapshotted on a sale line. Later catalogue edits must not rewrite prior receipts or order history.
- Products with stock movements or historical sales should be archived, not deleted. Any eventual delete rule must preserve referenced ledger/order history.
- Catalogue and stock writes must go through server-side, role-aware workflows; client-only hiding is not authorization.
- POS sales, fee transactions, and expense cashbook rows remain separate records. Reconciliation may report them together later, with currency and settlement status kept explicit.

## Reliance-inspired workflow choices

Reliance demonstrates a catalogue with an optional size/stock variant editor, historic sale-line snapshots, stock receipts, reasoned stock changes, and protected product deletion. Fordridge can use these workflow names and concepts with its own data model and branding. Reliance rows, prices, stock, users, credentials, and settings are excluded.

## Decisions still required before migration

1. Confirm whether to keep the staged Fordridge-native direction or provide verified external ownership/API documentation before production integration.
2. Confirm whether inventory is shared school-wide or allocated separately by campus; do not assign campuses from item names.
3. Confirm initial categories, allowed stock units, whether variants are size-only, and whether price differs by size.
4. Confirm who may manage the catalogue, receive/adjust stock, sell, view receipts, and request parent orders. Keep these permissions disabled until confirmed and enforced by backend policy.
5. Confirm allowed currency and pricing rules for this separate POS ledger. Do not reuse fee or expense choices without checking them against the shop workflow.

## Validation and deployment

This design was prepared from Fordridge's local role/schema/navigation source and Reliance's inventory/POS documentation and source. Review was read-only; the Reliance repository and Fordridge production were not modified. `git diff --check` is the documentation-stage check. No automated test, migration, product setup, deployment, or external integration was required.
