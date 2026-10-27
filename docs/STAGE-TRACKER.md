# Fordridge stage tracker

Last updated: 27 October 2026
Plan: [Fordridge portal roadmap](FORDRIDGE-ROADMAP.md)
GitHub: https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior

A stage is Complete only after its deliverable and checks are recorded in a pushed commit. Review-ready means the design is published and awaiting the listed school decision. No external deployment is implied.

| Stage | Status | Deliverable | Commit / evidence |
| --- | --- | --- | --- |
| 1 | Complete | Repository baseline | [61ef641](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/61ef641) |
| 2 | Complete | Fordridge feature/data/auth inventory | [77521ed](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/77521ed) |
| 3 | Complete | Verified Reliance reference | [6272e1a](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/6272e1a) |
| 4 | Complete | Reliance-to-Fordridge implementation map | [a760eaf](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/a760eaf) |
| 5 | Complete with follow-up | Build/lint/test baseline; signatory SQL parser fault corrected | Original: [98bc6f6](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/98bc6f6); current correction in this checkpoint |
| 6 | Complete | Master 85-stage roadmap and tracker | [8664533](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/8664533) |
| 7 | Awaiting owner approval | Proposed role and access matrix | [3f0fa3a](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/3f0fa3a) |
| 8 | Review-ready | Canonical class catalogue/backfill design | [eee634c](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/eee634c); awaiting official classes/streams/capacities |
| 9 | Not started | Class catalogue management | Depends on Stage 7 access approval and Stage 8 canonical catalogue decisions |

## Stage 5 follow-up status

Both report-signatory migrations now parse, and `node scripts/test-portal.mjs` passes all checks reported by the existing suite: migration application, atomic payments/retries/rollback, profile permissions, published notices, class scoping, guardian access, private records and teacher login. The test used isolated PGlite and did not access production.

The browser suite remains unrun because Playwright Chromium is missing. Stage 5 does not verify live migrations, RLS, Edge Functions, SMS or hosted deployment.

## Current decisions needed

- Stage 7: approve or amend the proposed Main Admin, Campus Admin, Principal, Accountant, Teacher, Parent, Student and Staff scopes and delegated actions in `STAGE-07-ACCESS-MATRIX.md`.
- Stage 8: provide/approve the official Junior and Senior class levels and streams, capacity policy, exit placements, campus ownership and subject-allocation rules in `STAGE-08-CLASS-CATALOGUE-DESIGN.md`.

No permission change or class migration has been applied. Class-catalogue implementation stays pending until those school decisions are recorded.
