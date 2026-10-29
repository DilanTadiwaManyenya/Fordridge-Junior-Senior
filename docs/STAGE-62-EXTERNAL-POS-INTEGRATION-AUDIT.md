# Stage 62: External POS integration audit

## Result

Fordridge's **Inventory & POS** navigation item is currently an outbound link to an external hosted app. The local navigation source exposes it to `staff` and `admin`. The Fordridge repository contains no inventory/product/stock/POS schema, API client, server integration, or evidence that the external service shares Fordridge authentication.

The link identifies a hosted application, but the system owner, tenant/account ownership, supported API, accessible data, authentication model, and security controls could not be verified from Fordridge's source or the available read-only web inspection. The page could not be fetched by the web inspection tool, and browser inspection stopped because the current browser URL could not be verified with sufficient confidence. No login, account recovery, API request, or data transfer was attempted.

## Verified boundaries

- Fordridge currently treats the external destination as navigation only; no local sync or reconciliation was found.
- No school data, credentials, environment values, or integration secrets were read, copied, or sent.
- No changes were made to the external service or the Reliance repository.
- The existing link is not evidence of ownership, availability, integration support, or permission to connect records.

## Required before Stage 63

The system owner must identify the external product and account owner and provide vendor documentation or an approved test environment covering:

1. Supported APIs, webhook/event behavior, rate limits, and version lifecycle.
2. Authentication method, credential storage/rotation, tenant isolation, and least-privilege scopes.
3. Available product, variant, stock, sale, payment, return, and order fields, with data ownership and export rules.
4. Source-of-truth rules for stock and payment, reconciliation IDs, retry/idempotency behavior, and audit responsibilities.
5. Whether staff need one shared login or separate role-scoped accounts, and how account removal works.
6. Approved data types and transfer destinations, retention, backup, and incident recovery expectations.

Until those items are verified, Stage 63 cannot safely select external integration over Fordridge-native scope. Preserve the existing external navigation link as a separate service; do not transmit learner/family or finance data to it.

## Deployment and validation

This is a documentation-only audit. No application, database, external-service, or production change was made. Checks were limited to local source inspection and `git diff --check`; no automated tests were needed.
