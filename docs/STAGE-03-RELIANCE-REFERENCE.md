# Stage 3: verified Reliance source reference

Date: 27 October 2026
Status: source-reference inspection complete; production behaviour not certified

## Reference provenance

Inspected D:/reliance-high-school/reliance-School read-only. Branch dev points to 9fc1b321e3c679ca9201c6cff2b417a12aed9477. A live ls-remote check confirmed GitHub dev has that same commit. Remote: https://github.com/DilanTadiwaManyenya/Reliance-junior-high-school.git.

Two pre-existing working-tree modifications were present: src/mobileUX.css and src/portalNavigation.css. Neither was edited, staged, reverted or pushed. This reference describes the inspected working tree, with those uncommitted visual differences explicitly excluded from claims about GitHub or production. No visual/browser inspection was performed in this stage.

No AGENTS.md was found in the repository or checked ancestor locations. Instructions.md and the editability diagnostic documents were read as project context. Historical intake instructions were not executed. No school seed data, credentials, account identities or production records were copied into Fordridge.

## Exact sidebar labels and identifiers

Source: src/components/portal/PortalSidebar.jsx. Preserve user-facing wording, not misleading internal identifiers. Labels below reflect the reference source; Fordridge branding remains Fordridge.

| Group | Internal section | Exact label | Visibility in reference sidebar |
| --- | --- | --- | --- |
| Workspace | subject-allocations | Subject allocations | Senior/non-Junior teacher |
| Workspace | dashboard | Class overview / My class | My class for Junior teachers; hidden in subject workspace |
| Workspace | roster | Learners | Hidden for teachers in subject workspace |
| Workspace | entry | Records / Markbook | Markbook for teachers; admin or applicable teaching workspace |
| Workspace | coursework | Course Work | Subject workspace or non-ECD-only Junior teacher |
| Workspace | library | Learning library | Subject workspace or Junior teacher |
| Workspace | progress-reports | Progress reports | admin/accountant |
| Workspace | settings | Account settings | All sidebar roles |
| Academic services | bulk-import | Bulk learner export | admin |
| Academic services | report-settings | Report settings | admin |
| Academic services | grade-bands | Grade bands | admin with all/Junior campus |
| Academic services | historical-reports | Historical reports | admin/principal/accountant |
| Academic services | classes | Classes | admin |
| Academic services | year-planning | Year rollover readiness | admin with all/Junior/Senior campus |
| Academic services | year-rollover | Reviewed year rollover | admin with all/Junior/Senior campus |
| Academic services | reporting-periods | Terms & marks locking | admin with all/Junior/Senior campus |
| Finance | fees | Finance | admin/principal/accountant |
| Finance | reconciliation | Income & expenses | Main Admin/accountant in sidebar condition |
| Finance | expenses | Expenses & Cashbook | Main Admin/principal/accountant |
| Finance | inventory | Inventory & POS | admin in all/Junior/Senior; accountant in Junior/Senior |
| Administration | library-support | Library oversight | admin in shared sidebar |
| Administration | newsletters | Newsletters | admin |
| Administration | staff | Staff | admin/principal |
| Administration | parent-accounts | Parent accounts | admin/accountant |
| Administration | activity | Activity Log | admin/principal |

The Terms page heading uses 'Terms and marks locking' while the sidebar uses 'Terms & marks locking'. The expenses heading also changes with permissions: 'Expenses & cashbook' or 'Cashbook breakdown'. These differences are real reference details, not evidence that the clipped screenshot used a different feature.

The bulk-import identifier currently renders Bulk learner export. Do not rename Fordridge's existing import into export: these are separate functions.

## Role model and navigation differences

Sources: context/AuthProvider.jsx, lib/portalProfile.js, lib/staffSectionAccess.js, components/portal/RoleSwitcher.jsx, StaffPortalLayout.jsx, AccountantWorkspaceNav.jsx, FeesDashboard.jsx.

- Staff roles are admin, principal, teacher and accountant. Main Admin and campus admin are scopes of admin: profile.campus is all, junior or senior. They are not separate role enum values in this reference UI.
- Auth loads user_roles, teacher_class_assignments and teacher_class_subject_assignments. activeRole derives from active_role with profile.role fallback. Switching validates membership, calls set_active_role, refreshes the profile, and navigates to the role destination.
- The selector appears only with multiple roles; switching has busy and error states. StaffPortalLayout keys the workspace by user and active role, resetting local workspace state on a switch.
- Profile loading has an explicit timeout/recovery helper. Fordridge already has basic error/retry UI; it still needs bounded requests and active-role behaviour.
- Principal finance is explicitly read-only in FeesDashboard; a matching principal-finance migration exists. Do not grant principal transactional access merely because Finance is visible.
- Teachers have class and subject workspaces. Junior ECD-only assignments suppress Course Work. Senior subject allocations and whole-form/stream scopes affect workspace choices.
- Accountants use a separate workspace navigation: Finance, Learner profiles, Academic progress, Expenses & Cashbook, Point of sale, Library oversight, Historical reports, Parent accounts. The shared sidebar alone is not the complete role experience.
- Library oversight is available to accountants through their workspace even though the shared sidebar shows it only to admin.
- A reference inconsistency requires investigation before implementation: reconciliation is offered by sidebar/StaffDashboard conditions, but lib/staffSectionAccess.js does not list reconciliation among allowed sections. Exact end-to-end availability is unverified. Fordridge should enforce one consistent capability definition rather than copying divergent lists.
- Reliance contains a migration disabling student portal access. Fordridge currently supports students; changing that product choice requires explicit scope review rather than copying it automatically.

## Workflow semantics to carry into Fordridge mapping

| Area | Verified source behaviour / evidence | Implication for Fordridge |
| --- | --- | --- |
| Classes and assignments | ClassManager, canonical class labels, class capacity and assignment helpers; a whole-form assignment supersedes streams and overlapping scopes are rejected | Extend existing ClassAssignments with a catalogue and clear scope semantics |
| Subject allocations | teacherAllocationScope matches canonical class, campus and optional stream | Apply scope consistently in UI, queries and backend permissions |
| Learner register export | learnerRegisterExport.js supports CSV and XLSX, guardian/profile columns, active/inactive coverage, Harare age calculation, formula neutralisation and text-preserved identifiers | Add export alongside existing import; do not use naive spreadsheet serialization |
| Coursework and reports | CourseWork, CourseworkMarks, JuniorCourseWork, JuniorReportBook, AcademicReportCard, report context and print utilities | Map distinct ECD, Grade, Senior and Sixth Form variants; preserve Fordridge's release snapshots/integrity |
| Historical reporting | HistoricalReportCard and ReportClassHistory; historical-context migration | Preserve the original class/year/campus context across roster changes |
| Rollover readiness | preview_year_rollover, scoped filters, pagination, review statuses and review CSV | Readiness is a separate preview/review feature, not the apply action |
| Reviewed rollover | Explicit promote/retain/transfer/complete decisions, registered destinations, historical-review prerequisite, capacity preview and school reason | Implement staged review before applying roster changes |
| Rollover retries/reversal | Batch reference reused after uncertain outcomes; server checks repeated; eligible Main Admin reversal with reason and history | Preserve identifiers, enrolment year, marks and fee history; avoid duplicate execution |
| Terms locking | reporting_periods/reporting_period_events; change_reporting_period with expected revision, reason and create/close/reopen/set_current actions | Database write protection must cover marks/components/ratings/notes/assessments; publication is a separate concept |
| Library oversight | LibrarySupport explicitly provides read-only oversight of teacher notes and school newsletters, scoped visibility and content trace | This is a digital learning-content feature, not physical books/loans/returns |
| Learning library | TeacherLearningLibrary, LearningLibraryWorkspace, ParentLearningLibrary and reader helpers | Add teacher publishing and eligible linked-parent reading as distinct workspaces |
| Private files | Learning/newsletter uploads reserve portal_content_files, finalize uploads and issue short-lived signed links | Storage policies and attachment lifecycle are required alongside UI |
| Newsletters | AdminNewsletters and schoolNewsletters helpers: publication/expiry dates, audiences, private attachments, reader acknowledgement | Extend beyond announcements; preserve scheduling, expiry and access checks |
| Parent accounts | ParentAccountSupport finds linked accounts and supports access recovery; temporary passwords are not redisplayed | Extend existing guardian links with controlled support and audit |
| Income & expenses | FinanceReconciliation plus reconciliation/export helpers | Compare accounting definitions and fix navigation consistency before porting |
| Expenses | ExpensesCashbook handles campus spending with approval and correction history | Extend basic Fordridge cashbook with explicit correction permissions |
| Fee safety | Idempotent-fee, financial-audit and Main Admin reversal migrations/helpers | Preserve atomic writes, safe retry identity, currency and traceable reversals |
| Inventory & POS | Native InventoryPOS, parent uniform shop, partial-payment and reversal migrations | Fordridge's external link is not equivalent; design stock/payment/order integration explicitly |
| Learner lifecycle | Controlled-correction, disabled-learner lifecycle and guarded-delete migrations | Carry forward history protection; never copy school-specific cleanup scripts |

## Backend reference anchors

Relevant local migrations include:

- 20260910100000_multi_role_active_access.sql
- 20261001100000_principal_finance_readonly.sql
- 20261003100000_school_classes_and_student_awards.sql
- 20261008151000_teacher_class_subject_allocations.sql
- 20261015100000_allow_whole_form_class_teachers.sql
- 20261019120000_historical_report_contexts.sql
- 20261019130000_controlled_year_rollover.sql
- 20261019140000_reporting_terms_and_marks_locks.sql
- 20261020100000_learner_register_export.sql
- 20261021140000_learning_library_newsletter_foundation.sql
- 20261021150000_parent_learning_library_reader.sql
- 20261021160000_newsletter_publishing.sql
- 20261021170000_library_support_oversight.sql
- 20261021200000_main_admin_pos_reversals.sql
- 20261021210000_pos_partial_payments.sql
- 20261021220000_fee_expense_financial_audit.sql
- 20261021230000_idempotent_fee_payments.sql
- 20261021233000_main_admin_fee_reversals.sql
- 20261021234500_controlled_expense_operations.sql
- 20261022100000_controlled_learner_corrections.sql
- 20261022110000_disabled_learner_lifecycle.sql
- 20261022180000_parent_account_support.sql
- 20261023100000_allow_campus_admin_learner_delete.sql

These are reference design anchors, not instructions to replay Reliance migrations against Fordridge. Fordridge has a different identity/schema model and its own report release protections. Deployed migration history was not queried.

## Corrections to the initial roadmap

1. Use Academic services (plural), Year rollover readiness, Reviewed year rollover, Terms & marks locking, and Expenses & Cashbook as verified menu names.
2. Replace the proposed book catalogue/loans/returns interpretation of Stage 75 with digital learning-content oversight. Physical-library lending is outside verified parity scope.
3. Add teacher Learning library and parent learning-resource access to the later implementation mapping; oversight alone is incomplete.
4. Model Main Admin/campus administration as scoped admin capabilities unless Fordridge requirements justify another design.
5. Include accountant-specific labels/workspace and teacher ECD/Grade/subject variants rather than forcing the administrator menu onto everyone.
6. Keep Fordridge's useful existing report readiness, official snapshots, approvals and integrity verification; exact parity does not require deleting them.
7. Treat apparent reference navigation inconsistencies as issues to resolve, not requirements to reproduce.

## Validation and next stage

This stage verified source labels, role definitions, workflow helpers/components, migration anchors and the remote dev commit. No Reliance source or data was changed. Application build/browser/database tests were not run because this stage changes documentation only; visual/deployed parity remains unverified. The Fordridge staged documentation diff is checked before commit.

Stage 4 maps this verified reference to existing Fordridge components, identifies dependencies and adjusts the implementation backlog without rebuilding existing functionality.
