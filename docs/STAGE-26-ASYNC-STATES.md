# Stage 26 — Async loading and retry states

## Deliverable

Added a reusable `AsyncState` for loading, empty, and recoverable error views.
Activity Log and Announcements/Timetable now use it. Their retries clear prior
rows, clear the previous error, show loading feedback, and ignore duplicate
load requests. Activity Log now catches rejected network requests instead of
leaving its loading state stuck.

## Validation

- `npm run build` — passed. The existing large-bundle warning remains
  (764.02 kB JavaScript output).
- `npm run lint` — passed with existing React effect and hook dependency
  warnings; no Stage 26-specific lint failures.
- `node scripts/test-portal.mjs` — passed; isolated migration, access, payment,
  class-scope, and privacy checks.
- `node scripts/test-portal-browser.mjs` using installed Chrome — passed. The
  Activity Log mock fails requests until the user retries; the retry recovers
  and creates exactly one additional request. Existing portal flows also pass.
- `git diff --check` — passed.

## GitHub and deployment

- Code commit: `dac4917701af86e229c856c34a66828e0bb6c7cd`
- Author: `DilanTadiwaInnoJuniorManyenya <dilantadiwamanyenya@gmail.com>`
- Pushed to the verified `origin/master` branch.
- Hosted frontend deployment remains pending; no production deployment was
  performed in this stage.

## Next

Stage 27 improves learner import parsing while preserving the existing CSV
format and providing a dry-run preview.
