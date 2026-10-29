# Stage 60: Income & expenses review

## Result

Added the Reliance-named **Income & expenses** page for Main Admin. It reads fee collections from Fordridge's `fee_transactions` ledger and outgoings from `cashbook_expenses`. The fee balance projection is not counted as income, avoiding duplicate collection totals.

The page provides text search, direction, category, currency, campus, and date filters. It shows a separate collection/expense/net summary for each currency and exports the same filtered rows and totals to CSV. Reads are paged in batches of 500; the export contains all rows currently matching the active filters.

## Scope and access

- The sidebar link and direct route are restricted to Main Admin. The component also rejects other roles.
- This preserves the existing database policy: only the current admin role reads the unscoped Fordridge cashbook. No Principal or Accountant access was added.
- Expenses are shown as **recorded**, with campus displayed as unassigned and approval state explicitly described as unavailable.
- POS and other income are excluded because Fordridge has no verified local source for them.
- Fee collections are portal ledger events, not proof of cash/bank settlement. Currencies are not converted.
- Recognized expense labels follow Stage 59's Reliance list. Other historical category text remains unchanged and is flagged for review.

## Validation

- `node scripts/test-portal.mjs` passes. New cases cover role navigation/access, source classification, Harare-local dates, historic categories, unassigned cashbook filtering, currency-specific totals, filtered CSV totals, and spreadsheet formula protection.
- `npm run lint -- --quiet` passes.
- `npm run build` passes with the existing large JavaScript chunk warning.
- Browser-test syntax and `git diff --check` pass.
- The mocked Chrome suite remains blocked before reaching Finance by the Learners “Back to overview” assertion recorded after Stage 58; this page has not been browser-verified.

## Deployment checkpoint

No database migration was needed. The frontend release remains pending. Accountant/Principal cashbook scope, historical campus assignment, expense approval/correction fields, and external POS reconciliation remain later work and must not be inferred from this view.
