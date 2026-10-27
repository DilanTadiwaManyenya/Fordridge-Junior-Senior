# Stage 14: bound portal profile loading

Date: 27 October 2026
Status: implemented locally; checks pass; commit/push pending
Approval basis: approved roadmap; stage is limited to request handling and recovery

## Acceptance scope

- Profile, active-role and membership loading has a single 12-second deadline.
- Sign-in role resolution and active-role switch requests also time out with a useful retry message.
- A timeout exits the loading spinner into a recoverable error state.
- A late result from an older request cannot replace a newer load or restore a signed-out profile.
- Successful loading and role switching preserve their existing behavior.

## Implementation

- Added `withPortalTimeout` to share a bounded request helper between portal loading and sign-in.
- Wrapped the dashboard's auth/profile/role-context/membership load in one 12-second deadline.
- Added request sequencing so sign-out, unmount or a newer retry invalidates older results.
- Bounded role switching and login role resolution; the existing retry button retries a failed profile load.
- No schema or production data changes.

## Checks

- `node scripts/test-portal.mjs` — PASS, including timeout success and stalled-request recovery assertions.
- `npm run build` — PASS. Existing large JavaScript chunk warning remains (754.97 kB minified).
- `npm run lint` — PASS (exit 0), with existing React effect/hook warnings.
- Browser suite — not run; Playwright Chromium remains unavailable per the baseline.

## Deployment and next stage

- No production deployment was performed. The active-role UI still depends on Stage 15 database policy enforcement before release.
- Stage 15 changes sensitive route and database authorization behavior. Review its concrete scope before implementation and obtain any required owner approval.
