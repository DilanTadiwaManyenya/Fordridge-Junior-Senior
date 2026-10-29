# Stage 59: Income and expense source mapping

## Result

This stage maps Fordridge's existing records to the Reliance-inspired **Income & expenses** review model. It is a documentation-only stage: no finance records, schema, role access, or Reliance files were changed.

## Fordridge source map

| Classification | Current Fordridge source | Reconciliation treatment | Limit |
| --- | --- | --- | --- |
| Learner fee collection | `fee_transactions` | Count each successful ledger transaction once as a recorded collection. Use the linked `fee_record_id` to report learner, campus, academic year/term, and fee currency. | Do not count `fee_records.paid_amount` as another receipt; it is a balance projection and would double-count the transaction ledger. A portal record is not proof of bank settlement. |
| School expense | `cashbook_expenses` | Show the recorded amount, date, category, currency, and reference as a recorded expense. | The table has no campus or approval/reversal status. It cannot yet be treated as campus-scoped or “approved spending.” Existing entries must not be rewritten to infer either value. |
| POS/uniform sale or payment | No Fordridge transaction source found; navigation links to an external Inventory & POS page. | Exclude from Fordridge totals until the integration/source is verified. | Do not count POS orders, sale totals, or external link presence as cash received. Avoid double-counting a sale and its associated payment if an integration is added. |
| Other income | No general-receipt or donation source found in the reviewed Fordridge schema. | Out of scope until Fordridge confirms a source and recording workflow. | Do not invent categories or add a manual “other income” amount that is not backed by a ledger record. |

## Reliance expense category reference

Reliance's Expenses & Cashbook form uses these expense labels: **Fuel, Stationery, Repairs, Food, Transport, Utilities, Other**. These are proposed as the starting controlled list for future Fordridge expense entry, following Reliance's labels and order. Stage 59 records the mapping only; the current Fordridge `cashbook_expenses.category` remains free text and is not altered.

For a future read-only report, exact recognized labels can be grouped as named categories. Legacy values that do not exactly match the controlled list should remain visible as their original text and be grouped into a review-needed bucket for totals; do not bulk rename or merge historical records without an approved mapping.

The payment method is a tender field, not an income/expense category. Fordridge fee transactions currently allow `bank_transfer`, `cash`, `card`, and `mobile_money`. Expense categories must remain separate from payment method, fee type, learner class, and POS product category.

## Reconciliation outcomes

The Reliance sequence distinguishes recorded collections from spending and excludes unresolved or reversed entries from net movement while showing them separately. Applied to Fordridge's present records:

1. Include each fee transaction once as a **recorded collection**, grouped by its fee-record currency and academic period.
2. Include a cashbook row only as a **recorded expense**. Do not label it approved or exclude it as pending because Fordridge has no expense status field.
3. Keep currencies separate. Preserve Fordridge's existing `USD` and `ZiG` values; do not convert them or silently map them to Reliance's `ZWG` code.
4. Exclude POS and other-income totals until a verified Fordridge data source exists.
5. Label totals as portal-recorded movement, not cash/bank reconciliation or proof of external settlement.
6. Preserve and flag uncategorized legacy expense strings for review; do not mutate source rows.

## Role and data boundaries

- **Main Admin:** all available Fordridge finance sources under the existing access model.
- **Principal:** read-only campus fee oversight exists, but cashbook access is intentionally excluded.
- **Accountant:** campus-scoped fee collection exists, but cashbook access is intentionally excluded.
- **Other roles:** no Income & expenses access is part of this mapping.

The existing `cashbook_expenses` table is not campus-attributed and is restricted to the current admin role. Therefore Stage 59 does not grant Principal or Accountant access. Any later campus-scoped cashbook work must resolve legacy unassigned rows and add enforced backend scope before exposing them to those roles.

## Follow-up decisions for later stages

- Stage 60 can build the read-only Income & expenses view over fee transactions and the clearly labelled legacy expense source, once the finance filter and totals acceptance cases are set.
- Stage 61 must determine whether Fordridge needs expense approval, correction, reversal, and audit fields before changing the cashbook workflow.
- POS reconciliation and extra income types remain blocked on identifying an authorised, reliable Fordridge source.
- Legacy free-text categories remain unchanged unless the school approves an explicit mapping plan.
