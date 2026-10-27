# Fordridge stage tracker

Last updated: 27 October 2026
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
| 16 | Implemented; validation passed; awaiting push | Principal read-only campus fee finance | [Stage 16 record](STAGE-16-PRINCIPAL-FINANCE.md); isolated policy/RPC suite, build and lint pass; cashbook remains unavailable because existing entries have no campus attribution |

## Stage 5 follow-up status

Both report-signatory migrations now parse, and `node scripts/test-portal.mjs` passes in isolated PGlite: migration application, atomic payments/retries/rollback, profile permissions, published notices, class scoping, guardian access, private records and teacher login. Production was not accessed.

The browser suite remains unrun because Playwright Chromium is missing. The isolated portal suite now covers whole-class and stream assignments, overlap rejection, assigned learner reads, direct attendance/mark RPC scope and wellbeing privacy.

## Current owner decision

The owner approved Stage 7's Main Admin, Campus Admin, Principal, Accountant, Teacher, Parent, Student and Staff matrix for staged implementation. The Classes page still uses Fordridge's existing admin role; campus-specific admin grants and new role membership are later roadmap stages. Stage 10 implements teacher class/stream scope only.

The class catalogue has no preloaded rows. Campus, class labels, streams and capacity remain unset until an admin enters school-confirmed values.
