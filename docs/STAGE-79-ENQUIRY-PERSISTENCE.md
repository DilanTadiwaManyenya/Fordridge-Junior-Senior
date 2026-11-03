# Stage 79 — Enquiry persistence

## Delivered

- Public admissions/contact forms show success only after Supabase confirms the `enquiries` insert.
- Missing Supabase configuration shows a visible unavailable message and does not attempt a write or claim receipt.
- Insert errors and network exceptions show a retry-safe failure message; entered fields remain available for retry.
- Successful submissions normalize surrounding whitespace and clear the form only after persistence succeeds.

## Verification

- `node scripts/test-portal.mjs` — passed; checks cover missing configuration, backend rejection, successful insert payload, and thrown network error.
- Targeted Oxlint — passed with the existing test-file unused-variable warning and public-site effect warning.
- `npm run build` — passed; 279 modules transformed. Existing large JavaScript chunk warning remains.
- `git diff --check` — passed.
