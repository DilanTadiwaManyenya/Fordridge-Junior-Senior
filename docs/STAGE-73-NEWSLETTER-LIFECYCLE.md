# Stage 73 — Newsletter lifecycle

## Delivered

- The existing Announcements route and table now use the Reliance-inspired **Newsletters** label in portal navigation and the page.
- Authors can save drafts, publish immediately, or schedule a future publication.
- Authors can target an existing role audience or all eligible campus members and set an optional expiry date.
- Recipient reads remain hidden until `published_at` and stop after `expires_at`; the database constraint rejects an expiry at/before publication.
- Existing announcement rows, report-release announcements, and the current campus/role policies are preserved.
- Attachments are disabled in this workflow. They require a separately approved audience and retention policy before adding private file storage.

## Verification

- `node scripts/test-portal.mjs` — passed; the isolated migration suite verifies draft/scheduled/expired recipient visibility and the expiry constraint.
- `npm run lint` — passed with existing warnings elsewhere in the project.
- `npm run build` — passed; Vite reported its existing large JavaScript chunk warning.
- `node --check scripts/test-portal-browser.mjs` and `git diff --check` — passed.
- Browser run was attempted but blocked before launch because the configured Playwright Chromium executable is missing.

## Release status

Migration: `20261103000000_newsletter_expiry.sql`. No production migration or hosted frontend deployment was performed. Both remain pending the normal approval/release process.

## Git checkpoint

Source commit: [b4c4919](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/b4c4919). Documentation commit: pending.
