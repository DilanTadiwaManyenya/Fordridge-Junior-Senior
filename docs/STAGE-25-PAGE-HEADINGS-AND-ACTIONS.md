# Stage 25 — Page headings and actions

## Deliverable

Added a shared **← Overview** return link to every portal subpage in the
Fordridge portal bar. It closes the mobile drawer when used. Standardised the
typography and spacing for workflow page headings and the secondary actions in
those headers. Existing primary action buttons and each page's success/error
feedback remain in place.

## Validation

- `npm run build` — passed. Existing large-bundle warning remains (763.29 kB
  JavaScript output).
- `npm run lint` — passed with existing React effect and hook dependency
  warnings; no new Stage 25 warnings.
- `node scripts/test-portal.mjs` — passed; isolated role, access, payment,
  migration, and privacy checks.
- `node scripts/test-portal-browser.mjs` using installed Chrome — passed,
  including the subpage return link and existing mocked portal flows.
- `git diff --check` — passed.

## GitHub and deployment

- Code commit: `3e82ed0b2d26dff5916c87302c4a6a3c69af7f6f`
- Author: `DilanTadiwaInnoJuniorManyenya <dilantadiwamanyenya@gmail.com>`
- Pushed to the verified `origin/master` branch.
- Hosted frontend deployment remains pending; no production deployment was
  performed in this stage.

## Next

Stage 26 standardises asynchronous loading, empty, error, and retry states.
