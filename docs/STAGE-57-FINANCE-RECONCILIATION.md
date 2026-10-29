# Stage 57: Finance balance and currency reconciliation

## Outcome

The Finance screen now shows billed, paid, and outstanding totals separately for each currency instead of adding unlike currencies together and formatting the result as USD. Main Admin, campus Principal, and campus Accountant can inspect read-only reconciliation totals grouped by campus, academic year, term, and the linked fee currency.

## Reconciliation checks

The report compares each fee record's `paid_amount` with the sum of its linked `fee_transactions`, and flags payment total mismatches, status inconsistencies, transactions attributed to a different campus, missing academic period, or missing currency. Main Admin can filter campus/year/term; Principal and Accountant are scoped to their active campus in the database. Anomaly output is capped at 200 rows with the total count and truncation state retained.

No exchange rate is applied. The existing `fee_transactions` table does not store a separate currency; the report therefore uses the currency on the linked fee record. It does not modify or repair financial data.

## Validation

- `node scripts/test-portal.mjs`: pass. Isolated PGlite checks Main Admin all-campus and campus/period filters, distinct USD/ZiG totals, ledger mismatch detection, Teacher denial, and Accountant campus isolation.
- `node --check scripts/test-portal-browser.mjs`: pass.
- `npm run lint -- --quiet`: pass.
- `npm run build`: pass; Vite reports the existing large JavaScript chunk warning.
- Mocked Chrome Finance flow passes currency-separated totals, reconciliation count, and mismatch rendering. The full browser suite subsequently fails at the existing tablet horizontal-overflow assertion at `scripts/test-portal-browser.mjs:754`.
- `git diff --check`: pass.

## Deployment status

Migration `20261031000000_fee_reconciliation_by_period.sql` and the Finance UI changes are local only. No production database or hosted frontend was changed. Production migration and frontend release remain pending their separate approvals.

## Git checkpoint

Commit and GitHub push are recorded in `docs/STAGE-TRACKER.md` after the stage commits are created.
