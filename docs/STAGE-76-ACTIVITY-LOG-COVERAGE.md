# Stage 76 — Activity Log coverage

## Delivered

- Parent newsletter acknowledgements now create an Activity Log event in the same transaction as the acknowledgement.
- Each event records the notice ID, campus, acknowledging user, action, and server-assigned acknowledgement time.
- Audit detail deliberately omits newsletter text, recipient content, and unrelated personal data. Existing acknowledgement scope and duplicate handling are unchanged.

## Verification

- `node scripts/test-portal.mjs` — passed in isolated PGlite; checks event attribution, server time, minimal detail, and one event after duplicate submission.
- `npx oxlint scripts/test-portal.mjs` — passed with one existing unused-variable warning in the test file.
- `npm run build` — passed after the sandboxed run failed with `spawn EPERM` loading the installed Tailwind native binding; the approved outside-sandbox retry transformed 278 modules.
- `git diff --check` — passed.

## Release status

Migration: `20261106000000_audit_newsletter_acknowledgements.sql`. Production migration and hosted frontend release were not performed.
