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
| 7 | Awaiting owner approval | Proposed role and access matrix | [3f0fa3a](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/3f0fa3a) |
| 8 | Complete: empty initial catalogue confirmed | Class/stream schema design; no seed data or capacity | User instruction: keep entries unset until allocation is known; design in [Stage 8 document](STAGE-08-CLASS-CATALOGUE-DESIGN.md) |
| 9 | Implemented; validation pending | Admin Classes screen and empty class/stream tables | [Stage 9 record](STAGE-09-CLASS-CATALOGUE.md); this checkpoint contains the implementation. No tests or migration deployment performed. |

## Stage 5 follow-up status

Both report-signatory migrations now parse, and `node scripts/test-portal.mjs` passes in isolated PGlite: migration application, atomic payments/retries/rollback, profile permissions, published notices, class scoping, guardian access, private records and teacher login. Production was not accessed.

The browser suite remains unrun because Playwright Chromium is missing. No new tests were run in Stage 9.

## Current owner decision

Stage 7's proposed Main Admin, Campus Admin, Principal, Accountant, Teacher, Parent, Student and Staff scopes still await approval. The Classes page currently uses the existing Fordridge admin role and does not introduce campus-specific administrator grants. Stage 10 teacher assignment access must follow the approved matrix.

The class catalogue has no preloaded rows. Campus, class labels, streams and capacity remain unset until an admin enters school-confirmed values.
