# Stage 24 — Mobile navigation

## Deliverable

Improved the shared portal navigation for phone and tablet use. The phone menu
toggle now has a changing accessible name, closes on Escape, and returns focus
to the toggle. Navigation links close the drawer, and keyboard focus is visible
on links, the toggle, and sign-out.

The browser fixture now mocks Fordridge's active-role context, role switching,
memberships, and teacher assignment requests so it matches the current portal
API without contacting Supabase.

## Validation

- `npm run build` — passed. The existing 763.11 kB JavaScript chunk warning
  remains.
- `npm run lint` — passed with existing React effect and hook dependency
  warnings; no new Stage 24 warnings.
- `node scripts/test-portal.mjs` — passed; isolated migration, role, payment,
  class-scope, and privacy checks.
- `node scripts/test-portal-browser.mjs` using the installed Chrome executable —
  passed. Checks include keyboard open/Escape close/focus return, touch route
  selection, phone overflow, tablet sidebar behavior, and existing mocked
  portal workflows.
- `git diff --check` — passed.

## GitHub and deployment

- Code commit: `e376b0414693f9f7fccbf20bdfebc8f71bfb9551`
- Mobile sidebar height follow-up: `5b291fe26dbc2007119acaee4594a0333016186c`
- Author: `DilanTadiwaInnoJuniorManyenya <dilantadiwamanyenya@gmail.com>`
- Pushed to the verified `origin/master` branch.
- The final phone screenshot was reviewed and a desktop full-height sidebar rule
  was overridden at the phone breakpoint to remove the empty full-screen panel.
- Hosted frontend deployment remains pending; no production deployment was
  performed in this stage.

## Next

Stage 25 standardises page titles, return paths, primary actions, and feedback.
