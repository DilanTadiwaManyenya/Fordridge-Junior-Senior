# Fordridge portal roadmap inspired by Reliance

Updated: 29 October 2026
Current checkpoint: Stages 1–48 implemented and validated locally. Stage 43 provides provisional, editable Reliance grade sequences; Stage 44 adds class-level live report variants using only Fordridge's recorded fields and current calculation rules; Stage 45 improves A4 print layout, learner context, and print naming; Stage 46 regression-checks report readiness; Stage 47 secures release attribution and audit; Stage 48 makes issued report snapshots read-only, protects them from cascade deletion, and blocks republishing over an existing issue. Production migrations and frontend deployment remain pending. Stage 49 (verify snapshot integrity) is next.

## Purpose

Bring Reliance's verified staff and school workflows to Fordridge with matching feature names, clear role-specific workspaces and dependable access rules. Keep Fordridge's branding, Junior/Senior school structure, existing fee records, admissions, parent/student sign-in and formal report release design.

The roadmap is an implementation sequence, not a claim that all features are approved for live use. Reuse existing Fordridge pages where they cover the workflow. Add only the missing capability. Keep permissions in Supabase policies/RPCs as well as in the menu. Do not replay Reliance migrations against Fordridge, copy Reliance records/credentials, or remove Fordridge's signed-off report snapshot and integrity controls.

## Verified reference names

- **Workspace:** Class overview / My class; Subject allocations; Learners; Records / Markbook; Course Work; Learning library; Progress reports; Account settings.
- **Academic services:** Bulk learner export; Report settings; Grade bands; Historical reports; Classes; Year rollover readiness; Reviewed year rollover; Terms & marks locking.
- **Finance:** Finance; Income & expenses; Expenses & Cashbook; Inventory & POS.
- **Administration:** Library oversight; Newsletters; Staff; Parent accounts; Activity Log.

Use a label only when the linked Fordridge screen performs that action. Keep Bulk learner import distinct from Bulk learner export. Library features are digital learning materials and newsletters; physical book lending is not in the verified reference. Preserve Fordridge's separate report readiness, release, approval, archive and integrity verification screens where useful.

## Current Fordridge starting point

Existing foundations include authentication for students, parents, teachers, staff and administrators; learners and staff directory; CSV learner import; attendance; records and bulk marks; teacher class assignments; announcements, notifications and timetable; fee tracking/payments; expense cashbook; academic analytics; grade bands; report readiness/release, snapshots, approvals, archive and integrity verification; activity log; and an external Inventory & POS link.

The evidence and limitations are in [Stage 2 inventory](STAGE-02-INVENTORY.md), [Stage 3 Reliance reference](STAGE-03-RELIANCE-REFERENCE.md), and [Stage 4 implementation map](STAGE-04-IMPLEMENTATION-MAP.md). The local pre-change verification results are in the [Stage 5 baseline](STAGE-05-VALIDATION-BASELINE.md).

## Delivery rules

1. Keep each stage small enough to review on its own and state its acceptance check before implementation.
2. Each stage gets a focused Git commit and push to the verified Fordridge GitHub remote. Check working-tree changes first and preserve unrelated work.
3. If a stage needs multiple commits, push each reviewed slice and update the tracker with every commit SHA.
4. A stage is Complete only when the listed code/configuration work and its applicable checks pass, the push succeeds, and the tracker records the commit. Mark external deployment work separately.
5. Record failures as blockers with evidence. Do not hide warnings or weaken access to obtain a green check.
6. For a database change, check migration order and local policy tests. Before frontend release, confirm the required live migrations/functions are deployed, following PORTAL-DEPLOYMENT.md.
7. Never copy credentials, real learner records, or Reliance production configuration to Fordridge. Use synthetic fixtures for local checks.
8. Treat any external-service access or school-policy choice as a dependency to resolve before its stage; the menu alone does not grant access.

## Stage sequence

Stages 1–17 are completed foundation, catalogue, teacher-scope, role-membership, active-context, Principal read-only finance and Accountant fee-operations work. The owner approved the Stage 7 capability matrix on 27 October 2026. Stage 18 makes teacher class-register and subject workspaces follow the active campus; the Fordridge class catalogue remains empty until school allocation is confirmed.

| Stage | Small deliverable | Acceptance check / dependency |
| --- | --- | --- |
| 1 | Verify Fordridge repository baseline | Repository, branch, clean status, instructions and remote recorded. |
| 2 | Inventory current Fordridge features | Routes, data model, roles and integrations classified with evidence. |
| 3 | Verify Reliance reference | Current source names, roles and workflow anchors recorded read-only. |
| 4 | Map reference to Fordridge | Existing code is mapped, gaps and dependencies ordered. |
| 5 | Establish pre-change checks | Build, lint and available isolated suites have honest baseline results. |
| 6 | Publish this roadmap and tracker | Small stages, dependencies, completion rules and statuses published. |
| 7 | Approve access capability matrix | Every role/scope/action has an owner and explicit allow rule before permission edits. |
| 8 | Design canonical Fordridge classes | Junior/Senior class, stream and capacity schema; migration/backfill preview reviewed. |
| 9 | Add class catalogue management | Admin create/edit/deactivate classes; assignments use canonical class IDs and reject overlaps. |
| 10 | Align teacher class assignments | Whole-class, stream and campus scopes resolve the same learners in screens and backend. |
| 11 | Separate subject allocations | Assigned subjects and classes scope Markbook and coursework writes. |
| 12 | Add safe role membership storage | Multiple roles require explicit grants; users cannot grant themselves a role. |
| 13 | Add active role switching | Switch validates membership, reloads workspace state and resets scoped data. |
| 14 | Bound portal profile loading | Profile requests time out, recover and never strand users on a spinner. |
| 15 | Gate sensitive routes and policies | Direct route and direct database requests enforce the matrix. |
| 16 | Review principal finance capability | If approved, finance is genuinely read-only in UI, RPC, grants and policies. |
| 17 | Define accountant finance scope | If approved, write and read access is explicit and campus scoped. |
| 18 | Verify teacher workspace entry | Class overview/My class and Subject allocations match assignment type. |
| 19 | Verify ECD/Grade workspace rules | Junior ECD and Grade teacher capabilities are explicit and checked. [Stage record](STAGE-19-JUNIOR-WORKSPACE-RULES.md) |
| 20 | Verify senior coursework access | Sixth Form and stream-specific subjects match assigned learners. [Stage record](STAGE-20-SENIOR-COURSEWORK-ACCESS.md) |
| 21 | Apply verified sidebar group labels | Workspace and Academic services use verified names and no dead links. |
| 22 | Align finance/admin navigation | Finance and Administration groups match the role capability matrix. |
| 23 | Add role-specific accountant navigation | Accountant Workspace opens only authorised finance/support screens. |
| 24 | Validate mobile navigation | Drawer, active state, keyboard and touch controls work at agreed viewports. |
| 25 | Standardise page titles and actions | Shared pages use clear title, return path, primary action and feedback. |
| 26 | Standardise async empty/error states | Retry and loading states avoid duplicate submissions and stale records. |
| 27 | Improve learner import parsing | CSV quoting, validation and dry-run preview preserve supported existing import. |
| 28 | Add bulk learner export | Scoped CSV/XLSX safely handles formula cells and keeps IDs as text. |
| 29 | Add learner roster filters | Search and filter use class catalogue and active/inactive status. |
| 30 | Add controlled learner corrections | Corrections record actor/reason and preserve issued report history. |
| 31 | Complete learner deactivate/reactivate | Access follows status and retained financial/academic history stays intact. |
| 32 | Review guarded learner deletion | Dependencies are checked and reports/financial history are protected. |
| 33 | Improve parent account directory | Find only authorised linked accounts and preserve relationship verification. |
| 34 | Add parent access recovery support | Recovery avoids displaying reusable credentials and records authorised action. |
| 35 | Verify parent-child boundaries | Parents can reach only verified linked learners' permitted data. |
| 36 | Review Markbook write scope | Teacher assignments and campus scope are enforced at the database boundary. |
| 37 | Review bulk mark validation | Limits, missing scores, duplicates and assessment dates are rejected clearly. |
| 38 | Define Fordridge coursework need | School assessment policy decides if separate Course Work screens are needed. |
| 39 | Add coursework model if approved | Small assessment workflow respects class/subject scope and period status. |
| 40 | Add report period registry | Periods and revisions are explicit; publishing a report is a separate state. |
| 41 | Add reviewed period close action | Reasoned close blocks writes through direct requests and frontend. |
| 42 | Add reviewed reopen/current action | Authorised change has a reason, revision check and audit event. |
| 43 | Verify grade bands by level | Junior/Senior scales and boundary examples match approved school rules. |
| 44 | Validate live progress report variants | Junior, Senior and Sixth Form outputs use correct fields and calculations. |
| 45 | Check printed report layout | Approved print output fits, remains readable and includes correct learner context. |
| 46 | Preserve report readiness checks | Completeness and approval checks block invalid release. |
| 47 | Preserve report release and audit | Release, announcement, author and period are traceable. |
| 48 | Preserve protected report snapshots | Later mark/profile changes cannot rewrite issued results. |
| 49 | Verify snapshot integrity | Hash verification catches changes and records actionable mismatches. |
| 50 | Add historical class context | Old reports retain the learner's original year/class/campus identity. |
| 51 | Add rollover readiness preview | Read-only preview lists eligibility and review reasons with no roster writes. |
| 52 | Add rollover destination validation | Destination classes exist and capacities are checked with proposed totals. |
| 53 | Add reviewed learner decisions | Promote, retain, transfer or complete is explicit per learner. |
| 54 | Add rollover batch preview | Reason and all placements are reviewed before execution. |
| 55 | Apply rollover transactionally | Batch is idempotent and preserves admission IDs, fees, marks and history. |
| 56 | Audit rollover and safe reversal | Eligible reversal requires reason and preserves a complete event trail. |
| 57 | Verify finance balances and currency | Fee charges, payments and totals reconcile by approved campus/period. |
| 58 | Verify safe fee retry and receipts | Repeated payment calls cannot create duplicate charges; receipt ties to ledger. |
| 59 | Map income & expenses categories | Define complete sources, classifications and reconciliation outcomes. |
| 60 | Improve income and expense review | View reconciles to ledger and exported totals match active filters. |
| 61 | Add expense review/correction steps | If required, submit, approve and correct with role and audit controls. |
| 62 | Inspect external POS integration | Confirm owner, access, supported API/data and security boundaries first. |
| 63 | Decide POS connection or native scope | School decision records inventory, checkout, payments, orders and reconciliation scope. |
| 64 | Design inventory catalogue | Variants and stock units work with the agreed system boundary. |
| 65 | Add auditable stock receipts | Opening/received quantities have an actor, source and movement record. |
| 66 | Add reasoned stock adjustments | Count corrections require authority and create immutable history. |
| 67 | Implement safe POS checkout | Sale/payment/stock update commit together and retry safely. |
| 68 | Add returns and order reconciliation | Refunds, parent orders and restored stock reconcile exactly once. |
| 69 | Define digital learning access | File types, audience, campus/class scope and retention rules are approved. |
| 70 | Add teacher learning library | Teachers publish permitted files and notes to eligible classes. |
| 71 | Add parent learning reader | Linked parents receive only published, in-scope resources. |
| 72 | Add private file lifecycle | Upload reservation, verification, short-lived links and cleanup are secure. |
| 73 | Add newsletter draft/publish flow | Audience, publish/expiry time and attachments are controlled. |
| 74 | Add parent newsletter acknowledgement | Read state is user-bound, scoped and duplicate-safe. |
| 75 | Add Library oversight | Read-only view traces content status, audience, file readiness and history. |
| 76 | Extend Activity Log coverage | New high-impact corrections/rollovers/content/finance actions are attributable. |
| 77 | Verify log scope and redaction | Roles see only allowed events; secrets and sensitive content are omitted. |
| 78 | Review public school placeholders | Confirm mission, curriculum, admission and contact text with Fordridge. |
| 79 | Verify enquiry persistence | Submission success reflects the backend result; unavailable configuration is visible. |
| 80 | Verify SMS and account onboarding | Approved test accounts complete login, verification and recovery. |
| 81 | Run focused access regression checks | Positive and negative user/class/campus cases match the matrix. |
| 82 | Run isolated database/browser suites | Harness/parser and browser dependencies are ready; results and failures recorded. |
| 83 | Review pending migration order | Required migrations and function deploys are checked against live history. |
| 84 | Deploy and verify frontend | Hosted commit, login and critical synthetic/test-account flows are confirmed. |
| 85 | Record handover and release checkpoint | Docs, completed commits, external deployment state and open issues are current. |

## Stage 5 baseline to resolve

- The build passes, with a 735.40 kB minified JavaScript chunk warning.
- Lint exits successfully with React effect update warnings and a missing `selected` dependency warning in BulkMarks.jsx.
- Stage 5 follow-up corrected malformed initials expressions in the live and snapshot signatory migrations. The isolated database suite now passes in PGlite, including policy and payment assertions.
- The mocked browser suite passes with the installed Chrome executable. Stage 24 adds keyboard, touch, phone, and tablet navigation checks.

Stages 7–20 establish access and class foundations. Do not roll out a new administrator/accountant capability until both page gates and database rules agree. No production deployment is certified by a local build or mock test.

## Current checkpoint

Stage 42 adds reasoned administrator reopening and current-period selection. Current-period handoff locks the campus row, checks both the requested revision and the displayed current-period revision, and records an event and Activity Log audit entry for each affected period. No dates or calendar rules are assumed. Stage 43 adds level-specific grade bands following the owner-approved provisional Reliance sequence: Junior ECD/Primary, O Level, and A Level. Complete scales are validated as a gap-free whole-number partition; campus overrides, legacy fallback for unmapped classes, reasoned audited saves, and threshold boundary preview are covered. Fractional averages are floored only for mapped groups. Existing released report snapshots are not recalculated. Stage 44 adds live report titles and field context for Junior, Senior O Level, and Sixth Form. It calculates the current equal-per-assessment mean of valid Markbook percentages, excludes Course Work, and applies the Stage 43 class-level grade scale. It does not invent Junior developmental/component marks, term/exam splits, coursework weights, or Sixth Form aggregate points absent from Fordridge's current model. Stage 45 formats the live report for A4 portrait printing, hides portal controls, includes learner admission/campus/class/stream context, assigns a learner/variant/term/year print title, and prevents learner details from overflowing the printable heading. Stage 46 adds regression coverage for readiness cards and database release gates. Stage 47 binds release attribution to the authenticated administrator and preserves the release/audit/announcement trail. Stage 48 revokes direct client writes to released snapshots, prevents deleting publications that have snapshots, blocks re-release over issued results, and proves later mark/profile changes leave every stored snapshot field unchanged. Isolated portal regression, mocked Chrome flows, lint, production build, and diff checks pass; existing lint and bundle-size warnings remain. See the [Stage 43 record](STAGE-43-GRADE-BAND-REVIEW.md), [Stage 44 record](STAGE-44-PROGRESS-REPORT-VARIANTS.md), [Stage 45 record](STAGE-45-PRINTED-REPORT-LAYOUT.md), [Stage 46 record](STAGE-46-REPORT-READINESS.md), [Stage 47 record](STAGE-47-REPORT-RELEASE-AUDIT.md), [Stage 48 record](STAGE-48-PROTECTED-REPORT-SNAPSHOTS.md), and [stage tracker](STAGE-TRACKER.md). Stage 49 (verify snapshot integrity) is next. Migrations `20261029110000_reporting_period_registry.sql` through `20261029160000_protect_report_snapshots.sql` and their frontend changes are not deployed. Earlier migrations/frontend releases remain pending production deployment/approval.
