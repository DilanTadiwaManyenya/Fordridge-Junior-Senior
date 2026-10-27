# Stage 18: teacher workspace entry and assignment scope

Date: 27 October 2026
Status: implementation validated; awaiting stage commit and push
Approval basis: owner-approved Stage 7 access matrix and roadmap sequence; no school allocations are seeded.

## Acceptance scope

- **My class** is visible only for the active Teacher context when that active campus has a class-register assignment.
- The class overview lists only class-register assignments and learners returned within the active campus/class/stream scope.
- Whole-class assignments cover the assigned class's streams; stream assignments display only that stream.
- Subject-only assignments do not appear as class-register scopes. Subject allocations remain in the separate, read-only teacher **Subject allocations** workspace.
- Direct `/portal/assignments` is administrator-only; direct `/portal/my-class` requires an active Teacher class-register assignment.
- Both class and subject authorization helpers enforce the active campus, so multi-campus teachers must switch context before accessing another campus.

## Implementation

- Added `MyClass.jsx` with active-campus assignment and learner queries, visible class scopes, assigned-learner lists, and links to attendance and Subject allocations.
- Added `teacher-workspace.js` to group class-register scopes and map learners by campus/class/stream. Subject-only assignments are excluded from class cards.
- Updated Portal navigation and route guards: teachers see **My class** only when their active campus has a class-register assignment; subject allocations remain separate. The existing administrator **Class assignments** screen remains unchanged.
- Filtered teacher Subject allocations by their active campus and gave the read-only teacher view assignment-type-specific guidance.
- Added `20261015000000_teacher_workspace_active_campus.sql` so direct class-register, subject, learner, timetable, and Markbook authorization follows the active teacher campus through the existing scope helpers.

## Checks

- `node scripts/test-portal.mjs` — PASS. Covers whole-class and stream My class grouping, omission of subject-only records, active-campus navigation capability, multi-campus teacher context switching, cross-campus denial before switching, access after switching, and the full existing policy/payment/report suite.
- `npm run build` — PASS. Existing large JavaScript chunk warning remains (761.94 kB minified).
- `npm run lint` — PASS (exit 0); existing React effect/hook warnings remain.
- `git diff --check` — PASS.
- Browser suite — not run; Playwright Chromium remains unavailable per the Stage 5 baseline.

## Deployment and data

- The new migration is not applied to Supabase; no frontend deployment was performed. Production migration/deployment require separate approval.
- Multi-campus and class/stream examples exist only in the isolated test database. Fordridge's real class, stream and subject allocations remain unset until school confirmation.
