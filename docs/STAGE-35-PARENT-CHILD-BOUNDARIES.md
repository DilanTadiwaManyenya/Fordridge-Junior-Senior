# Stage 35 — Parent-child access boundaries

Status: Implemented, validated, and pushed; production migration and hosted frontend deployment pending approval/deployment

## Finding and change

Several database policies and report RPCs checked a guardian link without checking that the account was using its active Parent role. A user with multiple roles could keep parent-linked reads while working in a different role.

Migration `20261028140000_active_parent_child_boundaries.sql` adds the shared `parent_can_view_learner` predicate and applies it to learner profiles, academic/attendance records, fees, payments, published report snapshots, and report ranking/signatory RPCs. Guardian links, parent-targeted announcements, timetables, and campus report-publication reads now require the active Parent role on their linked-child path. Existing self, teacher-assignment, campus, and Main Admin scopes remain intact.

The shared predicate requires the active role to be Parent and a guardian link to a learner profile. It does not change or remove stored links or school data.

## Validation

- `node scripts/test-portal.mjs` — passed in isolated PGlite. Covers linked and unlinked learners, profile/record/fee/payment/report reads, campus announcements and class timetable, active-role switching away from and back to Parent, and preservation of a learner’s own access.
- `npm run lint` — passed with existing warnings.
- `npm run build` — passed; existing large JavaScript chunk advisory remains.
- `scripts/test-portal-browser.mjs` — passed in Chrome with mocked backend requests; no browser errors.
- `git diff --check` — passed.

## Deployment

Code commit: [`d6bf8c9`](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/d6bf8c9).

The migration is versioned and pushed to GitHub but has not been applied to production. Production migration approval and hosted frontend deployment remain pending.
