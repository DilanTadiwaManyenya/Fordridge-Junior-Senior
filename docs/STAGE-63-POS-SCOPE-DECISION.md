# Stage 63: Inventory & POS scope decision

## Decision status

**Recommendation prepared; owner confirmation is required before Stage 64.** Stage 62 found only a hardcoded Fordridge link to an external POS app. Its owner, API, authentication, data model, and security boundaries are unverified. Building an integration against an unknown service would make stock and payment records depend on an unverified data owner and access model.

## Recommended boundary

Build **Inventory & POS** as a Fordridge-native workspace using Fordridge's existing Supabase authentication, role membership, audit approach, and Fordridge branding. Keep the existing external link as a separate service until its ownership and integration contract are verified. Do not import or sync data from that app by assumption.

Use Reliance's verified workflows as inspiration for feature names and user flow:

- searchable product catalogue with product variants such as uniform sizes;
- opening/received stock and reasoned stock adjustments;
- checkout with available-stock checks and a receipt;
- recorded sale/payment entries with safe retries;
- parent order requests only if Fordridge confirms that audience and workflow;
- returns/reversals with a traceable audit trail;
- stock and sales summaries that reconcile without mixing currencies.

These are proposed capabilities and workflows. Fordridge-specific product catalogue, sizes, stock, pricing, order eligibility, payment methods, campus assignments, and account access must remain unset until confirmed. No Reliance school data, users, credentials, or environment settings are part of the recommendation.

## Separation and role principles

- POS sales/payment records remain separate from learner fee transactions and the expense cashbook. Reconciliation can present them together later without merging ledgers.
- A payment-method choice records a payment reported by the operator; it must not be described as a card/mobile-money charge unless an approved processor integration is separately designed.
- Checkout must be an atomic database operation with current-price/stock checks, an idempotent request ID, immutable sale-line snapshots, and audit records before it is enabled.
- Catalogue and stock management belong to explicitly authorized administrator roles. A cashier role may read stock and record sales only within its assigned school scope. Parent ordering must use a verified linked learner and approved product scope. Do not add Principal, Accountant, campus-admin, teacher, or parent permissions until the owner confirms the intended matrix and backend policies enforce it.
- Do not add campus to products or assign campus values unless Fordridge confirms that Inventory & POS uses the existing Junior/Senior campus split and gives an allocation rule.
- No payment gateway, external POS API, third-party credentials, stock migration, or production operation is authorized by this recommendation.

## Alternatives

| Option | Benefits | Unknowns / risks | Current status |
| --- | --- | --- | --- |
| Integrate the existing external app | Could avoid rebuilding catalogue and checkout if it is owned and provides a supported API | Owner, tenant ownership, API, data access, role mapping, stock/payment source of truth, and security terms are not verified | Not recommended until Stage 62 evidence is supplied |
| Build natively in Fordridge | Uses existing Fordridge auth, roles, audit, and database boundaries; can follow Reliance workflows while retaining Fordridge branding | Requires separate staged catalogue, stock, checkout, return, and reconciliation work; school-specific configuration still needs confirmation | Recommended; requires owner confirmation before Stage 64 implementation |

## Requested owner confirmation

Before Stage 64 begins, confirm one choice:

1. **Fordridge-native (recommended):** proceed with a separate native catalogue/stock/POS ledger. Confirm which Fordridge roles may manage products and which may sell.
2. **Connect the existing app:** provide its product and account owner, official API/security documentation, and an approved sandbox/test account. No production credentials should be posted in chat.

If neither choice is confirmed, leave the external link unchanged and keep product, variant, stock, payment, and campus configuration unset.

## Validation and deployment

This is a documentation-only recommendation based on read-only Fordridge source review and Reliance workflow documentation/source. No database or application changes were made, and no external account was accessed. `git diff --check` is the documentation-stage validation. Stage 64 is blocked on owner confirmation.
