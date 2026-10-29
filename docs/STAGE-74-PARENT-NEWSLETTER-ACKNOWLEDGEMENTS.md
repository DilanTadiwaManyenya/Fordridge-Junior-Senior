# Stage 74 — Parent newsletter acknowledgements

## Delivered

- Parent Notifications now identifies the parent update view as **Newsletters & notifications** and preserves per-notice and mark-all-read actions.
- Receipt selection and insertion require both the authenticated user's ID and an announcement visible under the current active role's announcement RLS policy. Draft, scheduled, expired, wrong-audience, and wrong-campus notices cannot receive receipts through direct client requests.
- The database sets `read_at`; client-supplied times are ignored. Client acknowledgement uses conflict-ignore semantics, so duplicate clicks do not create extra receipts or change the original time.
- Client roles cannot update or delete receipt rows. Switching active role refreshes the notification list; receipts for notices hidden in that role are not returned.
- Existing announcement rows and receipt data are preserved. No deletion or destructive data operation was added.

## Verification

- `node scripts/test-portal.mjs` — passed; isolated migration and RLS checks cover a parent's own visible receipt, hidden and expired notices, cross-user writes, role switching, server timestamps, duplicate no-op, and blocked receipt edits.
- `npx oxlint src/portal/NotificationCenter.jsx src/portal/PortalDashboard.jsx` — passed with existing React effect warnings.
- `npm run build` — passed; Vite reported its existing large JavaScript chunk warning.
- `git diff --check` — passed.
- Browser interaction was not run.

## Release status

Migration: `20261104000000_parent_newsletter_acknowledgements.sql`. No production migration or hosted frontend deployment was performed. Both remain pending the normal release process.

## Git checkpoint

Source commit: [1013164](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/1013164). Documentation commit: pending.
