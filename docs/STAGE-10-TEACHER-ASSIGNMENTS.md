# Stage 10: align teacher class assignments

Date: 27 October 2026
Status: complete; implementation commit pushed to `origin/master`
Implementation commit: [d226bf2](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/d226bf2)
Approval basis: owner approval of the Reliance-inspired Stage 7 access matrix

## Acceptance scope

- New teacher assignments use canonical Fordridge class and optional stream IDs.
- A class-wide assignment covers every stream in that class. A stream assignment covers only that stream.
- Learner profile reads, learner-record reads/writes, attendance RPCs, mark-entry RPCs, timetables, rankings, report signatories and released-report reads use the same teacher campus/class/stream rule.
- Overlapping assignments for the same subject and class are rejected, including whole-class/stream overlaps. Different streams can have different subject teachers.
- Existing text-only assignments remain visible and retain exact campus/class matching. A null stream means whole-class, following the approved matrix. An admin can link a legacy row only when it exactly matches a confirmed catalogue class and stream.
- The Fordridge class catalogue remains empty by default. Test classes were created only in the isolated PGlite database; no school allocations were added.

## Implementation

- Added migration `20261008000000_teacher_assignment_scopes.sql` with canonical assignment IDs, exact-match legacy backfill, a shared teacher-scope helper, assignment validation/overlap checks, audit coverage for legacy links, and matching RLS/RPC/report/timetable rules.
- Updated Class assignments to select confirmed catalogue entries, state whole-class scope clearly, and link exact legacy entries once the catalogue is populated.
- Updated Bulk attendance and Bulk mark entry so class-wide assignments include all learner streams in the selected class.
- Extended the isolated portal database suite for whole-class and stream-specific access, campus/class denial, overlap rejection, assigned learner reads, wellbeing privacy and direct attendance/mark RPC calls.
- Recorded the owner's approval of the Stage 7 matrix.

## Checks

- `node scripts/test-portal.mjs` — PASS. Migrations apply in isolated PGlite; whole-class scope includes multiple streams; a stream assignment sees only that stream; another class and campus are denied; overlapping subject assignments and non-catalogue new assignments are rejected; direct attendance/marks RPCs enforce scope; wellbeing remains private.
- `npm run build` — PASS. The existing large JavaScript chunk warning remains (743.43 kB minified).
- `npm run lint` — PASS with existing React effect and hook warnings across the project.
- Browser suite — not run; Playwright Chromium remains unavailable per the existing baseline.

## Deployment and follow-up

- The migration has not been applied to Supabase. No production database or frontend deployment was accessed. Production migration/deployment still requires separate owner approval.
- Legacy assignments without an exact catalogue match remain text-only and keep their previous scope. Administrators can link them after the school confirms and enters the corresponding class/stream names.
- Stage 11 remains next: subject allocations and subject-scoped Markbook/coursework writes.
