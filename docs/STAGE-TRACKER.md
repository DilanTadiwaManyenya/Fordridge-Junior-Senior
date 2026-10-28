# Fordridge stage tracker

Last updated: 28 October 2026
Plan: [Fordridge portal roadmap](FORDRIDGE-ROADMAP.md)
GitHub: https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior

A stage is Complete only after its deliverable and relevant checks are recorded in a pushed commit. Implemented; validation pending means code is pushed but the listed checks have not run.

| Stage | Status | Deliverable | Commit / evidence |
| --- | --- | --- | --- |
| 1 | Complete | Repository baseline | [61ef641](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/61ef641) |
| 2 | Complete | Fordridge feature/data/auth inventory | [77521ed](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/77521ed) |
| 3 | Complete | Verified Reliance reference | [6272e1a](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/6272e1a) |
| 4 | Complete | Reliance-to-Fordridge implementation map | [a760eaf](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/a760eaf) |
| 5 | Complete with follow-up | Build/lint/test baseline; report-signatory SQL fixed | Original: [98bc6f6](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/98bc6f6); isolated suite passes at [aa11ad0](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/aa11ad0) |
| 6 | Complete | Master 85-stage roadmap and tracker | [8664533](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/8664533) |
| 7 | Complete: owner approved 27 Oct 2026 | Reliance-inspired role and access matrix | [3f0fa3a](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/3f0fa3a); owner approval recorded in this checkpoint |
| 8 | Complete: empty initial catalogue confirmed | Class/stream schema design; no seed data or capacity | User instruction: keep entries unset until allocation is known; design in [Stage 8 document](STAGE-08-CLASS-CATALOGUE-DESIGN.md) |
| 9 | Complete | Admin Classes screen and empty class/stream tables | [Stage 9 record](STAGE-09-CLASS-CATALOGUE.md); isolated portal suite and production build pass; no live migration deployment |
| 10 | Complete | Canonical, campus/class/stream-scoped teacher assignments | [d226bf2](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/d226bf2); [Stage 10 record](STAGE-10-TEACHER-ASSIGNMENTS.md) |
| 11 | Complete | Separate Subject allocations and subject-scoped Markbook writes | [1ff87d7](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/1ff87d7); [Stage 11 record](STAGE-11-SUBJECT-ALLOCATIONS.md); isolated tests, build and lint pass |
| 12 | Complete | Server-controlled role memberships and audited grants | [e8afb27](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/e8afb27); [Stage 12 record](STAGE-12-ROLE-MEMBERSHIP.md); isolated tests, build and lint pass; live migration/function deployment pending |
| 13 | Complete | Per-session active-role switching and workspace reset | [31f60c9](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/31f60c9); [Stage 13 record](STAGE-13-ACTIVE-ROLE-SWITCHING.md); isolated tests, build and lint pass; database policy enforcement remains Stage 15 |
| 14 | Complete | Bounded profile, role-context and membership loading with retry | [dbf1762](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/dbf1762); [Stage 14 record](STAGE-14-PROFILE-LOADING.md); isolated timeout checks, build and lint pass |
| 15 | Complete | Active-role authorization boundary and scoped-admin route guard | [302e267](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/302e267); tracker follow-up [86fbcfd](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/86fbcfd); [Stage 15 record](STAGE-15-ACTIVE-ROLE-AUTHORIZATION.md); isolated migration/policy suite, build, lint and diff checks pass |
| 16 | Complete | Principal read-only campus fee finance | [caf9461](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/caf9461); [Stage 16 record](STAGE-16-PRINCIPAL-FINANCE.md); isolated policy/RPC suite, build and lint pass; cashbook remains unavailable because existing entries have no campus attribution |
| 17 | Complete | Campus-scoped Accountant fee operations | [0f479c3](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/0f479c3); [Stage 17 record](STAGE-17-ACCOUNTANT-FINANCE.md); isolated payment/RLS suite, build, lint and diff checks pass; cashbook and expense operations remain unavailable pending campus attribution |
| 18 | Complete | Teacher My class and active-campus subject workspace | [4cb42e4](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/4cb42e4); [Stage 18 record](STAGE-18-TEACHER-WORKSPACE.md); isolated assignment/RLS suite, build, lint and diff checks pass; no class/stream data seeded |
| 19 | Complete | Junior ECD/Grade My class scope regression coverage | [4b562a1](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/4b562a1); [Stage 19 record](STAGE-19-JUNIOR-WORKSPACE-RULES.md); portal suite, build, lint and diff checks pass; synthetic fixtures only |
| 20 | Complete | Senior Sixth Form stream-and-subject access regression coverage | [923baab](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/923baab); [Stage 20 record](STAGE-20-SENIOR-COURSEWORK-ACCESS.md); portal suite, build, lint and diff checks pass; synthetic fixtures only |
| 21 | Complete | Verified Workspace and Academic services sidebar groups; confirmed internal destinations are implemented | [05b973d](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/05b973d); [Stage 21 record](STAGE-21-SIDEBAR-GROUPS.md); source route audit, production build and diff check pass; no code change required |
| 22 | Complete | Finance and Administration sidebar groups; Account settings under Workspace | [08fa0c4](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/08fa0c4); [Stage 22 record](STAGE-22-FINANCE-ADMIN-NAVIGATION.md); build, lint, isolated portal suite and diff check pass; hosted frontend deployment pending |
| 23 | Complete | Role-specific Accountant workspace limited to currently authorised Finance screens | [22848b4](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/22848b4); [Stage 23 record](STAGE-23-ACCOUNTANT-NAVIGATION.md); role navigation assertions, build, lint and isolated portal suite pass; hosted frontend deployment pending |
| 24 | Complete | Accessible phone drawer and responsive portal navigation | [e376b04](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/e376b04), mobile height fix [5b291fe](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/5b291fe); [Stage 24 record](STAGE-24-MOBILE-NAVIGATION.md); build, lint, isolated portal suite, Chrome browser suite and diff check pass; hosted frontend deployment pending |
| 25 | Complete | Shared page heading style and Overview return path | [3e82ed0](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/3e82ed0); [Stage 25 record](STAGE-25-PAGE-HEADINGS-AND-ACTIONS.md); build, lint, isolated portal suite, Chrome browser suite and diff check pass; hosted frontend deployment pending |
| 26 | Complete | Shared loading, empty, error and retry states in Activity Log and school content | [dac4917](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/dac4917); [Stage 26 record](STAGE-26-ASYNC-STATES.md); build, lint, isolated portal suite, Chrome retry test and diff check pass; hosted frontend deployment pending |
| 27 | Complete | Quoted CSV parsing, local row validation, normalized phones, and pre-import preview | [dfee5a4](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/dfee5a4); [Stage 27 record](STAGE-27-LEARNER-CSV-IMPORT.md); parser unit checks, targeted/full lint, build, Chrome preview/confirmation flow and diff check pass; hosted frontend deployment pending |
| 28 | Complete | Filtered learner CSV export with spreadsheet-safe text and formula handling | [f3321b0](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/f3321b0); [Stage 28 record](STAGE-28-LEARNER-EXPORT.md); export unit checks, lint, build, Chrome download/filter test and diff check pass; hosted frontend deployment pending |
| 29 | Complete | Learner roster filters for class/form, stream and enrolment status | Code: see [Stage 29 record](STAGE-29-LEARNER-ROSTER-FILTERS.md); build, lint, isolated portal/export checks, mocked Chrome filter/export flow and diff check pass; hosted frontend deployment pending |

## Stage 5 follow-up status

Both report-signatory migrations now parse, and `node scripts/test-portal.mjs` passes in isolated PGlite: migration application, atomic payments/retries/rollback, profile permissions, published notices, class scoping, guardian access, private records and teacher login. Production was not accessed.

The isolated portal suite covers whole-class and stream assignments, overlap rejection, assigned learner reads, direct attendance/mark RPC scope and wellbeing privacy. The mocked browser suite passes with the installed Chrome executable; Stage 24 adds keyboard, touch, phone, and tablet navigation checks.

## Current owner decision

The owner approved Stage 7's Main Admin, Campus Admin, Principal, Accountant, Teacher, Parent, Student and Staff matrix for staged implementation. The Classes page still uses Fordridge's existing admin role; campus-specific admin grants and new role membership are later roadmap stages. Stage 10 implements teacher class/stream scope only.

The class catalogue has no preloaded rows. Campus, class labels, streams and capacity remain unset until an admin enters school-confirmed values.
