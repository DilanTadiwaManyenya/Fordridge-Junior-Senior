# Stage 4: Reliance-to-Fordridge implementation map

Date: 27 October 2026
Starting Fordridge commit: 6272e1a
Status: mapping complete; no feature code changed

## Scope

This map combines Fordridge's source inventory (Stage 2) with the verified local Reliance reference (Stage 3). Status describes source overlap, not live production readiness. The Reliance source inspection had two uncommitted CSS changes; they are not part of this feature mapping. No Reliance migrations are being copied or replayed. Fordridge retains its separate schema, Junior/Senior identity and school content.

The implementation rule is: reuse Fordridge workflows that already work; add a missing capability as a bounded stage; update names only after confirming the page implements that same user action. A familiar label must not turn an import into an export or an announcement into a scheduled newsletter.

## Workspace features

| Reliance reference | Fordridge implementation | Map and decision | Dependencies / later stage |
| --- | --- | --- | --- |
| Class overview / My class | AdminOverview, PortalOverview | Reuse. Provide role-scoped class overview and teacher My class entry; current overview exists but must be checked against assignment scope. | Stage 7 access model; Stage 8 class catalogue; overview follow-up |
| Learners | Directory; profiles | Reuse roster and learner CRUD. Match navigation name and apply defined learner status/history rules. | Stage 9 directory and account lifecycle |
| Records / Markbook | LearnerRecords; BulkMarks; learner_records; record_bulk_marks | Reuse and map Record vs Markbook per active role. Confirm whole-form, stream and subject allocation before exposing teacher edits. | Stage 7 permission model; Stage 10 assignments; academic checks |
| Course Work | No Fordridge equivalent found | New coursework workspace only if Fordridge's school workflow requires continuous assessment separate from marks/report records. Scope migration and component model first. | Stage 10/11 decisions |
| Learning library | No Fordridge equivalent found | New digital resources feature, including teacher publishing and eligibility-filtered reading; this is not a physical book-loan system. | Roles and file/storage access; Stage 14 |
| Progress reports | ProgressReports; existing print action | Reuse. Validate Junior/Senior report variants and replace source placeholders only with confirmed Fordridge rules. | Grade bands, assignment scope, print review |
| Account settings | AccountSettings | Reuse; check role-specific password/account recovery and profile fields. | Stage 7 auth |

## Academic services

| Reliance reference | Fordridge implementation | Map and decision | Dependencies / later stage |
| --- | --- | --- | --- |
| Bulk learner export | Bulk learner import exists; no register export | Keep import and export distinct. Add scoped CSV/XLSX export with formula-safe cells, stable text IDs and declared columns. | Class model, scope permissions, export policy; Stage 9 |
| Report settings | ReportSettings; report_term_settings | Reuse Fordridge approvals, dates and report configuration; map field-by-field. | Report review |
| Grade bands | GradeBands; report_grade_bands | Reuse. Confirm level/campus-specific scales and calculation boundaries. | Academic policy decisions |
| Historical reports | ReportArchive; OfficialReports; report_release_snapshots | Reuse snapshots as the authoritative released record; add historical class context if missing. Do not replace issued snapshots with a live marks query. | Verify snapshot scope and history mapping |
| Classes | ClassAssignments free-text; no independent catalogue found | Add canonical class/stream records and capacity as Fordridge requires. Add assignment collision rules: whole-class covers every stream; reject overlapping duplicates. | This is a foundation for roster, attendance, marks, teacher access, rollover, fees and export; Stage 8 |
| Year rollover readiness | None | Add read-only readiness/preview with explicit reasons for review and safe export. Do not promote during preview. | Class catalogue, historic report context, lifecycle policy; Stage 12 |
| Reviewed year rollover | None | Add individual promote/retain/transfer/complete decisions, destination capacity preview, reason, explicit review, idempotent batch and eligible reversal. Preserve admission IDs, enrolment history, marks and fee records. | Readiness, classes and history; Stage 12 |
| Terms & marks locking | No dedicated registry or screen found | Add period registry, reasoned close/reopen/current-period changes and revision checks. Database policies/RPCs must block direct writes to marks and components when closed. Publication is a separate control. | Assessment model, role policy; Stage 11 |
| Report readiness/release | ReportReadiness, ReportPublication; multiple supporting migrations | Reuse and retain Fordridge's complete-coverage preflight, approvals, release audit and announcement. Map to Reliance release patterns without replacing Fordridge snapshot hashing. | Preserve current invariants |
| Historical release verification | ReportVerification and hash migration | Reuse as Fordridge-specific added protection. Include as a preserved invariant, even where the Reliance menu has no identical label. | Must continue validating snapshots after history/rollover |

## Finance, inventory and administration

| Reliance reference | Fordridge implementation | Map and decision | Dependencies / later stage |
| --- | --- | --- | --- |
| Finance | FeesDashboard; fee records, fee transactions/settings and payment RPCs | Reuse fee ledger and dynamic tuition. Extend payment allocation/receipt and role-specific read/write only after reconciliation tests. | Role/campus access; finance accounting map; stages 13–14 |
| Income & expenses | Fee module and ExpenseCashbook partly cover the area | Add explicit income/expense reconciliation view and category mapping; define which income sources feed it and how adjustments/reversals reconcile. | Finance event model and audit scope; Stage 13 |
| Expenses & Cashbook | ExpenseCashbook; cashbook_expenses; audit triggers | Reuse current cashbook and add reviewed submission/approval/correction steps if Fordridge needs them. Use exact Reliance heading where the same view is served. | Role/campus policy; finance stage |
| Inventory & POS | External link in PortalDashboard; no native Fordridge module found | Integration gap, not a native feature. Inspect external product access, data ownership, stock, payments, orders and reconciliation. Then choose a safe supported integration or plan native build. Do not imply link equals synchronized POS. | External system access and approved contract; Stage 14 |
| Parent accounts | GuardianLinks only | Build an admin/account support view for finding linked parents and recovering access. Retain explicit relationship verification and existing parent/student RLS. | Account provisioning, linkage and audit; Stage 15 |
| Library oversight | No matching Fordridge view | Build read-only support for digital learning files and newsletters: campus/class/stream, release status, expiry, file readiness and content activity trace. | Learning library/newsletters and storage policies; Stage 15 |
| Newsletters | Announcements and notifications | Add newsletter lifecycle separately: draft, target audience, publish and expiry, private attachments, parent acknowledgement. Keep announcements as their current feature. | Content model and private file lifecycle; Stage 15 |
| Staff | Directory | Reuse account/staff management; add explicit campus scope and role capabilities after matrix approval. Avoid granting a new role solely to show a menu item. | Stage 7 |
| Activity Log | ActivityLog; audit_trail | Reuse and fill coverage for new reviewed workflows. Add sensitive-field redaction and scope filters where needed. Do not claim all mutations are logged until inventory confirms it. | New finance, rollover and content audit events |

## Shared role and interface mapping

| Reliance capability | Fordridge starting point | Required mapping |
| --- | --- | --- |
| Admin with all/Junior/Senior campus scope | admin plus profile campus_id | Model central and campus administration as scoped permissions. Audit every RLS policy/RPC. Confirm whether Fordridge needs separate principal and accountant capabilities. |
| Principal read-only finance | no principal role | If adopted, enforce read-only in the database as well as hiding actions. Do not derive permissions only from navigation. |
| Accountant workspace | no accountant role or dedicated finance navigation | Establish a stable role/capability design before adding the workspace and account data scope. |
| Teacher roles | teacher and teacher_class_assignments | Extend to subject allocation where required; whole-class, stream, and campus matching must be consistent in client and server. |
| Parent/student | parent/student roles and linked guardian RLS | Preserve Fordridge's separate sign-in and registration rules. Match Reliance learning resources only for correctly linked and eligible children. |
| Multi-role access | single profiles.role, no active role | Add role grants, persisted active role, membership validation, route reset, request cancellation and direct backend enforcement. Never allow self-assignment. |
| Navigation and mobile layout | Fordridge workspace/management sidebar and mobile menu | Align group names, section order, icons and responsive interaction with reference. Keep Fordridge name/crest and extra reporting verification entry. |
| Authentication loading/recovery | Supabase auth and dashboard retry states | Add bounded profile loading and explicit recovery; verify phone/SMS delivery and server function separately. |

## Proposed dependency-aware backlog

1. **Access foundation:** establish a role/campus/class capability matrix; identify every backend policy and RPC affected. No permission expansion before this model is reviewed against Fordridge data.
2. **Class foundation:** catalogue of school classes, streams, campus and capacity; data migration/backfill plan; teacher assignments and overlap handling.
3. **Learner scope:** strengthen learner lifecycle and parent account management; safe register export; preserve controlled corrections and report history.
4. **Academic scope:** consistent teacher assignments; optional coursework workflow; reporting-period write locks; validate existing grade and report policies.
5. **Report continuity:** map historical class context; keep readiness/release and immutable snapshots/hash verification; confirm reports after rollover.
6. **Rollover:** readiness preview, explicit reviewed decisions, capacity validation, transactional/idempotent apply, audit and eligible reversal.
7. **Finance:** existing fee ledger, expense workflow, accounting/reconciliation semantics, read-only vs transactional capabilities, receipts and correction audit.
8. **POS:** inspect external integration; decide connection or replacement; define stock/payments/order/reversal transaction boundaries.
9. **Learning content:** secure storage rules; teacher library; parent reader; newsletter lifecycle; read acknowledgements; library oversight/content trace.
10. **Navigation finish:** exact verified labels and role workspaces after the underlying page/capability exists; avoid dead links and leaking menu labels.
11. **Validation baseline:** Stage 5 records current build, lint and isolated suites before the first application-code change. Run test suites only when a scoped implementation requires them.

## Decisions resolved for the roadmap

- Stage 75 from the original long plan means digital learning-content oversight, not physical-library lending.
- The external Inventory & POS hyperlink is an existing integration pointer only; treat native POS parity as a separate project decision.
- Preserve Fordridge's independent report-release snapshots, approvals, history and integrity verification.
- Keep bulk import and bulk export as separate actions.
- Implement views only after their permissions and supporting data exist; route/menu visibility is not authorization.
- Do not transplant Reliance migrations, school records, names, account configuration or credentials into Fordridge.

## Evidence and limits

This is a source-level feature/dependency mapping grounded in Stage 2 and Stage 3. It does not establish production deployment, effective live RLS, real SMS delivery, external POS ownership, or actual school policy approval. Those are explicit implementation checks before affected features go live.

No feature code was changed in Stage 4. Stage 5 is the pre-change build/lint/test baseline, followed by the Stage 6 tracker/roadmap update.
