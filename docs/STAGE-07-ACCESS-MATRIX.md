# Stage 7: proposed access capability matrix

Date: 27 October 2026
Status: approved by the Fordridge owner for staged implementation; no production permissions changed
Fordridge starting commit: 8664533

## Owner approval

The Fordridge owner approved this Reliance-inspired role and access matrix on 27 October 2026. Implement capabilities in roadmap order, enforcing each capability in database policies/RPCs as well as the UI. Approval of the design does not approve applying migrations to production or deploying the application; obtain that approval at the production deployment stage.

## Approved design

This approved role and data-scope model guides the staged implementation before multiple role grants or later features widen access. It is not a deployed policy. Fordridge currently has student, parent, teacher, staff and admin profiles, and many admin policies grant broad access. The owner approved the Reliance-inspired scopes below for implementation in roadmap order.

## Scope model

Every request must satisfy both a capability and a data-scope check. A role alone never grants access across another campus, class, stream or family. The active role selects one authorized role context; the permission union of all roles is never used to answer a request.

| Scope | Meaning |
| --- | --- |
| School-wide | Both Fordridge Junior and Senior campuses. Reserved for explicitly appointed Main Admin accounts. |
| Campus | Only the campus granted for that role. A campus administrator cannot see or change the other campus. |
| Assigned class | Teacher's current class/stream assignment, including canonical school/campus identity. A whole-class assignment covers that class's streams; conflicting overlaps are rejected. |
| Assigned subject | Assigned classes and subjects only; verify learner, campus and subject together. |
| Linked learner | Parent/guardian may access only a learner whose verified link is active, and only fields released to that family. |
| Self | Student may access only their own permitted profile, records and released reports. |

The current profiles.campus_id and teacher_class_assignments are useful starting data, but the inspected policies often check only `role = admin`. Stage 12–15 must migrate toward explicit role grants and scoped helpers; do not assume the current admin policy already enforces campus separation.

## Proposed capabilities

Legend: **Manage** = view/create/edit within scope. **Read** = view only. **Approve** = explicit school action with actor and reason recorded. **Export** = permitted scoped extract. **Assigned** = teacher assignment constraint. **Linked** = family link constraint. **Own** = authenticated person's own record. **—** = no access. All rows remain subject to the scope rules above.

| Feature/data | Main Admin | Campus Admin | Principal | Accountant | Teacher | Student | Parent | Staff |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| School settings, campuses and role grants | Manage school-wide | Manage own campus settings only | Read assigned school/campus settings | — | — | — | — | — |
| Learner/staff accounts and profiles | Manage school-wide | Manage own campus; no admin grant changes | Read directory fields needed for leadership | Read billing identity; create enrolment only if explicitly approved | Read assigned-class directory; edit own profile only | Own basic profile | Linked child basics; own account | Own profile only |
| Parent-child links | Manage school-wide | Manage own campus | Read | Read for assigned billing workflow | — | Own linked status only | Own links | — |
| Classes and teacher assignments | Manage school-wide | Manage own campus | Read | Read classes needed for billing | Read own assignments | — | Linked child's current class | — |
| Attendance | Manage all | Manage own campus | Read assigned campus | — | Create/edit assigned class; read scoped history | Own released attendance | Linked child's released attendance | — |
| Academic records / Markbook / Course Work | Manage all | Manage own campus | Read assigned campus | Read published progress only | Create/edit assigned class and subject while period is open | Own released records | Linked child's released records | — |
| Report settings and grade bands | Manage all | Manage own campus after policy confirms campus-specific config | Read | Read | Read applicable config | — | — | — |
| Report release/readiness/approval | Approve school-wide release | Approve own campus release if explicitly delegated | Read; no publish by default | Read | Enter scoped data; no release | Read released report only | Read linked released report | — |
| Historical reports and verification | Read/export school-wide; manage release | Read/export own campus | Read assigned school/campus | Read relevant academic/finance context | Assigned learners and authorised years | Own records | Linked child records | — |
| Period close/reopen/current term | Approve school-wide with reason | Approve own campus with reason | Request only; no direct change by default | — | — | — | — | — |
| Year rollover preview and decisions | Approve all campuses | Review/apply own campus | Review/read; no apply by default | Read-only roster check if needed | Verify assigned learners; no apply | — | — | — |
| Finance settings, charges and fee ledgers | Manage school-wide | Manage own campus; no other-campus fees | Read-only, as in Reliance | Manage approved finance actions within campus | — | Read own balance and receipts | Read linked child's balance and receipts | — |
| Payments, reversals and refunds | Record and approve reversals with audit | Record own-campus payments; reversal approval requires explicit delegation | Read-only | Record allowed campus payments; no fee/receipt deletion or reversal by default | — | — | Make online payment only if an approved payment flow exists | — |
| Income & expenses / reconciliation | Manage and reconcile all | Manage own-campus entries; school-wide reconciliation unavailable | Read-only assigned scope | Manage assigned-campus entries; reconcile per grant | — | — | — | — |
| Expenses & Cashbook | Manage school-wide; approve/reverse with reason | Submit/review own campus; approval separation required | Read-only or approve within delegation; no self-approval | Submit and manage assigned campus; approval by separate approver | — | — | — | — |
| Inventory & POS | Manage school-wide config and audited reversals | Manage own campus | Read reports only if needed | Operate assigned campus inventory/POS; no unrestricted reversals | — | — | View/pay own parent orders only when supported | — |
| Learning library and newsletters | Manage/publish school-wide | Manage/publish own campus | Read published content | Read oversight as needed | Publish permitted content for assigned classes | Read released eligible resources | Read released resources for linked child | — |
| Library oversight/content trace | Read-only school-wide | Read-only own campus | Read-only where delegated | Read-only per Reliance workspace | Own published content status only | — | — | — |
| Activity log/audit | Read school-wide; immutable events | Read own-campus events | Read delegated scope | Read own finance events | Read own submitted changes where appropriate | — | — | — |
| Bulk learner/finance exports | Scoped school-wide export | Own-campus learner export | No default export | Finance-only assigned-campus export | No bulk export | Own data download if separately supported | Linked-child download if separately supported | — |

### Explicit default restrictions

- Student, parent, principal, teacher and ordinary staff cannot create or edit finance ledger entries, set school-wide roles, publish a report, alter an issued snapshot, delete audit history, or change a closed period.
- Principal Finance is read-only in the verified Reliance reference. Preserve that property in UI, database grants, policies and RPCs if Fordridge approves principal access.
- Accountant finance rights are limited to the expressly assigned campus and transaction functions. Main Admin retains high-impact fee/POS reversals unless Fordridge separately approves delegated reversal.
- Teachers edit only assigned class/subject work during an open period. A whole-class assignment supersedes streams; an unassigned stream or campus is rejected server-side.
- Parents require a verified active guardian link for every child request. Student/parent access to academic notes never includes confidential wellbeing fields.
- No hard-delete permission is implied by Manage. High-impact removal uses a controlled workflow, dependencies/history guards and an audit reason.
- Read access to a report publication is not access to an unpublished report or every learner's underlying data. Released snapshots follow learner/class/campus scope.
- Newsletter acknowledgement changes only the signed-in reader's acknowledgement.

## Approval and separation-of-duties rules

| Action | Proposed rule |
| --- | --- |
| Assign an elevated role or Main Admin scope | Existing Main Admin approval; record actor, recipient, role, campus and reason. No self-grant. |
| Publish a reporting period | Main Admin or explicitly delegated campus admin; readiness passes; publish action is separately audited. |
| Close/reopen a reporting term | Main Admin or delegated campus admin; expected revision and reason required; writes are blocked in the database while closed. |
| Apply reviewed year rollover | Main Admin or campus admin for their assigned campus; source history checked; destinations and capacity previewed; one idempotent batch. |
| Reverse rollover, fee or POS batch | Main Admin by default, or a separately approved reversal capability; reason required and original event retained. |
| Approve expense | Submitter cannot approve their own expense. If staffing makes this separation impractical, document the exception and heightened audit before enabling it. |
| Publish newsletter/resource | Admin or delegated campus admin for that audience; private attachments and expiry are enforced by storage/read policies. |

## Enforcement requirements

Before this design is implemented:

1. Move role membership and campus grants into a server-controlled model. The client cannot edit its own role, active-role entitlement or campus scope.
2. Resolve active role and campus from trusted database state for every protected RPC/policy. Do not trust a browser-supplied role, campus, class or teacher ID.
3. Centralise helpers for capability, campus, assignment, linked learner, active learner and reporting-period state; audit all existing policies that use broad `my_role() = 'admin'`.
4. Grant minimum table/RPC rights. Revoke public execution for sensitive functions and grant only the authenticated capability they require.
5. Enforce row scope in RLS or guarded RPCs even when a screen is hidden; route guard and UI buttons are additional usability controls.
6. Keep protected reports immutable. Snapshot history and integrity checks must still pass after correction, deactivation and rollover.
7. Audit role grants, account linking, finance mutations/reversals, report release, period changes, rollover batches and protected exports; redact secrets and confidential note contents.
8. For every capability, test both allowed and forbidden paths, including direct RPC calls, cross-campus learner IDs, unassigned streams, inactive links, closed periods and changed active roles.

## Fordridge migration impact

This matrix requires a carefully staged redesign before copying Reliance role tables. Fordridge currently stores one `profiles.role`; the enum has student, parent, teacher, admin and staff. Current directory and provisioning flow uses admin, and existing RLS/RPC definitions frequently grant all admins the same scope. No principal, accountant or multi-role capability is currently deployed in the inspected source.

The proposal's Main Admin/Campus Admin is an admin role plus a trusted scope grant, not automatically a new role string. Principal and accountant are proposed capabilities that Fordridge's owner must approve. They are not added to the enum in this stage. Likewise, whether campus administrators can manage their campus or only central admin can manage both must be approved and verified against school operations.

Apply the approved design through the roadmap's small implementation stages. Production migration and deployment still require separate approval.

## Approved matrix decisions

1. Approve or edit the roles: Main Admin, Campus Admin, Principal, Accountant, Teacher, Parent, Student, Staff.
2. Confirm whether Campus Admin may create accounts, set teacher assignments, publish reports, close periods and apply rollover within their campus.
3. Confirm whether Principal receives read-only Finance and which campus/school reporting data is visible.
4. Confirm Accountant's allowed fee payment, expense submission/approval, inventory checkout and finance-export actions. Reversals stay Main Admin by default.
5. Confirm whether ordinary staff accounts should have any portal pages beyond Account settings.
6. Confirm that student/parent read access is only their own or verified linked child's released information, and that confidential wellbeing notes stay hidden.
7. Confirm the two-campus Junior/Senior scopes and how a person legitimately assigned to both campuses switches context.

## Stage 7 status

The role/scope proposal and enforcement checklist are approved for staged implementation. Stage 7 is **Approved**. This approval does not apply production policies; later access-control stages implement the approved rules in order.
