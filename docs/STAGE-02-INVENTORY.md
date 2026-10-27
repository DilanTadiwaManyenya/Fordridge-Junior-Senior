# Stage 2: Fordridge implementation inventory

Date: 27 October 2026
Starting commit: 61ef641
Status: source inventory complete; live functionality remains unverified

## Evidence and status definitions

This inventory reviews src/App.jsx, src/portal, src/site, src/lib/supabase.js, all migration definitions, the account-provisioning function, deployment documentation, and test entry points. Existing means source and wiring are present, not that a production workflow has passed. Partial means some implementation exists but a concrete limitation remains. Missing means no matching implementation was found in the inspected application and migrations. Unverified means execution or live deployment evidence is still needed. No confirmed runtime breakage is claimed from source inspection alone.

No application code, dependencies, environment files, or school data were changed. No live accounts or production database were accessed. Environment values were not read or copied. Stage 3 must verify the current Reliance source before claiming exact parity or finalising names.

## Application and route map

Stack: React 19, React Router 7, Vite 8, Tailwind 4, Supabase JS 2, and Oxlint, as declared in package.json. Version ranges are declarations, not a fresh installed-version audit.

Public routes: /, /about, /junior-school, /senior-school, /gallery, /admissions, /contact.

Authentication routes: /portal/login (entry selector), /portal/parent/login, /portal/parent/signup, /portal/student/login, /portal/student/signup, /portal/staff/login.

PortalDashboard handles /portal and /portal/:view. Unknown or disallowed views redirect to /portal. The overview is AdminOverview for admins and PortalOverview for other roles.

| View suffix | Current menu name | UI roles | Source |
| --- | --- | --- | --- |
| overview (or /portal) | Overview | All authenticated profiles | AdminOverview.jsx / PortalOverview.jsx |
| learners | Learners | admin | Directory.jsx |
| staff | Staff | admin | Directory.jsx |
| import-learners | Bulk learner import | admin | BulkLearnerImport.jsx |
| records | Records | student, parent, teacher, admin | LearnerRecords.jsx |
| reports | Progress reports | student, parent, teacher, admin | ProgressReports.jsx |
| report-settings | Report settings | admin | ReportSettings.jsx |
| grade-bands | Grade bands | admin | GradeBands.jsx |
| report-release | Report release | admin | ReportPublication.jsx |
| report-readiness | Report readiness | admin | ReportReadiness.jsx |
| report-archive | Report archive | student, parent, teacher, admin | ReportArchive.jsx |
| official-reports | Official reports | student, parent, teacher, admin | OfficialReports.jsx |
| report-approvals | Approval register | admin | ReportApprovalRegister.jsx |
| report-dashboard | Report dashboard | admin | ReportReleaseMetrics.jsx |
| report-verification | Report verification | admin | ReportVerification.jsx |
| attendance | Class attendance | teacher, admin | BulkAttendance.jsx |
| attendance-history | Attendance history | teacher, admin | AttendanceHistory.jsx |
| analytics | Academic analytics | teacher, admin | LearningAnalytics.jsx |
| marks | Bulk mark entry | teacher, admin | BulkMarks.jsx |
| assignments | Class assignments | teacher, admin | ClassAssignments.jsx |
| fees | Finance | student, parent, admin | FeesDashboard.jsx |
| cashbook | Expense cashbook | admin | ExpenseCashbook.jsx |
| activity | Activity log | admin | ActivityLog.jsx |
| announcements | Announcements | All authenticated profiles | SchoolContent.jsx |
| notifications | Notifications | All authenticated profiles | NotificationCenter.jsx |
| timetable | Timetable | All authenticated profiles | SchoolContent.jsx |
| account | Account settings | All authenticated profiles | AccountSettings.jsx |

These are frontend role gates, not a complete RLS audit. Record-level scope is implemented in database policies and RPCs and needs independent negative-access verification.

## Feature classification and follow-up

| Feature | Status | Evidence / limitation | Planned follow-up |
| --- | --- | --- | --- |
| Public school pages | Partial | Routes and layouts exist; PublicSite.jsx contains explicit EDIT THIS copy, curriculum, admissions and map placeholders | Confirm school content before publication |
| Admissions/contact enquiry submission | Partial | PublicSite.jsx inserts enquiries when configured; without configuration it skips insertion and can still show thanks | Verify persistence and correct the no-configuration outcome |
| Portal navigation | Existing; alignment pending | Workspace/Management groups, mobile menu and route guards exist | Compare names, grouping and responsive behaviour with Reliance |
| Phone sign-in and public registration | Existing; live unverified | PortalLogin.jsx uses password, signup, OTP, resend and password-change APIs | Verify SMS provider, account recovery, and hosted callbacks |
| Login/profile recovery | Partial | PortalDashboard catches errors and offers retry, but has no explicit request timeout | Verify stalled-request recovery and auth refresh handling |
| Role permissions | Partial relative to roadmap | Single profiles.role, five supported roles; policies/RPCs exist | Verify current isolation and design expanded role matrix |
| Active role switching | Missing | No active-role selector or multi-role mapping found | Implement only after verified Reliance comparison |
| Learner/staff directory | Existing | Directory reads profiles; edits through admin_update_profile and provisions through create-portal-account | Verify admission, validation and authorisation paths |
| Bulk learner import | Partial | Sequential provisioning with per-row results; simple comma splitting, no quoted-field support, shared initial password | Decide supported CSV contract and onboarding improvements |
| Bulk learner export | Missing as dedicated feature | Attendance CSV export exists, but no learner-directory export found | Add scoped learner export separately from import |
| Guardian linking | Partial relative to Parent accounts | GuardianLinks manages existing parent links from learner directory | Dedicated parent directory/account lifecycle still needed |
| Learner records and attendance | Existing | LearnerRecords, BulkAttendance and AttendanceHistory; learner_records storage and bulk RPC | Verify confidential-note, campus and guardian access |
| Class assignments | Partial relative to Classes | Teacher/class/stream/subject rows exist; free-text classes rather than standalone class catalogue | Define class catalogue and whole-form/stream semantics |
| Bulk marks and analytics | Existing | BulkMarks and LearningAnalytics plus academic records/RPC | Verify assigned scope, limits and calculation cases |
| Report settings and grade bands | Existing | Dedicated components and report_term_settings/report_grade_bands | Preserve and compare to reference |
| Progress reports and printing | Partial | ProgressReports and window.print exist; official format confirmation placeholder remains | Validate approved variants, A4 output and mobile controls |
| Report readiness/release | Existing | Preflight, publication, audit, announcement and complete-coverage migrations | Verify behaviour with isolated tests and deployment history |
| Historical/official reports | Existing foundation | Archive plus protected report_release_snapshots with outcomes, signatories, approvals and hashes | Verify historical class context and name mapping before consolidation |
| Report integrity verification | Existing | ReportVerification plus snapshot integrity-hash migration | Preserve during report redesign |
| Terms and marks locks | Missing as dedicated workflow | Report publication/snapshot protection exists; no dedicated reporting-period lock UI/table found | Define explicit write locks; do not equate publication with a marks lock |
| Year rollover and review | Missing | No rollover route, component or schema found | Preview, review, execution and preserved history |
| Finance and fee payments | Existing; broader scope pending | FeesDashboard, fee settings/records/transactions and atomic payment workflow documented | Verify receipts, amounts, retries and role separation |
| Income and expenses | Partial | Fee receipts and expense cashbook cover parts of the domain | Compare to Reliance income categories and reconciliation workflows |
| Inventory & POS | External integration only | PortalDashboard links to inventory-management-system-3xi2f.sevalla.page for staff/admin | Verify ownership, access and integration contract before native replacement |
| Announcements/notifications/timetable | Existing | SchoolContent, NotificationCenter, targeted audiences and announcement_reads | Preserve; confirm newsletter scope separately |
| Newsletters | Missing as dedicated feature | Announcements are present; no newsletter lifecycle found | Compare draft, audience and publishing requirements |
| Library oversight | Missing | No library component, route or schema found | Catalogue, loans, returns and oversight |
| Activity log | Existing | ActivityLog reads audit_trail; triggers cover specified workflows | Audit coverage and scope; avoid claiming every change is logged |

## Authentication and access model

The original app_role enum defines student, parent, teacher and admin; migration 20260923120000 adds staff. PortalLogin uses canEnterPortal: staff entry accepts staff/teacher/admin, while parent and student entries require their respective role. Signup metadata accepts parent or student; elevated accounts use administrator provisioning.

PortalDashboard loads the authenticated user and their profiles row (role and campus), then gates routes. It listens for SIGNED_OUT. There is no account-level multiple-role collection, active-role state, principal, accountant, campus-admin, librarian or shop-operator role in the inspected role definitions. Admin is the current broad management role; it must not be described as a campus-limited administrator without a policy audit.

create-portal-account verifies the calling profile is admin, validates inputs/campus and uses the server-side Auth administration API to create student/teacher/staff accounts. Its runtime secret must remain backend-only. Guardian relationships use student_guardians. Teacher assignments use teacher_class_assignments. The exact consistency between assignments and every academic policy is not certified by this inventory.

## Database objects defined locally

The migrations contain 18 application table definitions; this is a local schema inventory, not the production table list.

| Domain | Tables |
| --- | --- |
| Identity and organisation | campuses, profiles, student_guardians, teacher_class_assignments |
| Communication and public enquiries | announcements, announcement_reads, timetable, enquiries |
| Academic records | learner_records |
| Reporting | report_term_settings, report_grade_bands, report_publications, report_release_snapshots |
| Finance and audit | fee_records, fee_transactions, fee_settings, cashbook_expenses, audit_trail |

Migration history includes role/phone normalisation, learner profile fields, tuition lookup corrections, controlled profile updates, payment workflows, teacher records, bulk attendance/marks, assignment policies, cashbook/audit, targeted notices, report governance, rankings, release preflight, snapshots and integrity hashes.

Important callable workflows include admin_update_profile, get_fee_breakdown, create_term_fee_record, record_bulk_attendance, record_bulk_marks, report_class_ranking and report_subject_signatories. Policies, triggers and grants must be evaluated after the complete migration sequence because later migrations replace earlier definitions.

## Integrations and deployment boundaries

- Supabase: Auth, PostgREST/RPC and create-portal-account Edge Function. Client setup uses VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY with placeholder detection. Actual environment values were not inspected.
- SMS: phone OTP/recovery needs a configured provider; source code does not prove delivery.
- Vercel: vercel.json declares Vite build, dist output and SPA rewrites. Hosted deployment status is unverified.
- Inventory/POS: external link only; shared authentication, stock/finance synchronisation and availability are unverified.
- Printing: browser print APIs, not evidence of a tested PDF-generation service.
- Public contact: WhatsApp link is conditional on configured school content; map/content placeholders remain.

## Existing verification tooling

package.json exposes build and lint scripts. scripts/test-portal.mjs applies local migrations to isolated PGlite and exercises portal/database behaviour. scripts/test-portal-browser.mjs uses Playwright and mocked Supabase responses. Both use optional dependencies under ignored .portal-test-tools; their existence does not prove current passing results or production access.

Build, lint, database tests and browser tests were not run in this documentation-only stage. Stage 5 establishes the execution baseline. This stage's checks are source inspection, route/schema inventory, and Git diff whitespace validation. No automated tests were added for this documentation.

## Priorities carried forward

1. Stage 3: read current Reliance source and verify reference names, roles and workflows.
2. Stage 4: map verified reference features to existing Fordridge components; preserve report snapshots and integrity verification.
3. Stage 5: run existing validation and document current failures before application edits.
4. Stage 6: save the full roadmap and tracker, using this inventory to avoid duplicating implemented features.
5. Resolve role architecture before adding accountant/principal/campus-specific operations.
6. Treat native POS, library, newsletters, rollover, class catalogue and term locks as candidate gaps until the reference comparison is complete.

Stage 2 is complete as an inventory; feature changes and production verification belong to subsequent stages.
