# Stage 71 — Parent Learning Reader

## Status

Implemented and locally verified. The production migration and hosted frontend release remain pending. No production database, Storage bucket, or Reliance repository was changed.

## Delivered

- Added the parent Learning library route and Workspace navigation. The route remains unavailable to students, staff, administrators, and other roles.
- Parents can select among their currently enrolled, linked learners and read published resources matching that learner's campus, class, and stream.
- Parent authorization is enforced by a security-definer database predicate and RLS. It checks the active Parent role, existing school-managed guardian link, learner role, `enrollment_status='active'`, campus, class, and stream on every resource/file access.
- A resource with no stream applies to all streams in that exact campus and class. A stream-specific resource requires an exact learner stream; subject allocation is not used to infer a learner's access.
- Parent resource reads exclude drafts and archived content. Parent file metadata and private Storage reads expose only the active, finalized file. Signed links expire after 60 seconds.
- Added a `(parent_id, student_id)` guardian lookup index. Existing guardian-link permissions remain the source of verified relationships; parents cannot create or edit links through this feature.

## Validation

- `node scripts/test-portal.mjs` — passed. Added positive and negative PGlite checks for active linked learners, no student access, same-class whole-stream access, stream-specific denial, campus mismatch, inactive enrollment, removed guardian links, archived-resource denial, active-only file metadata, and private-object scoping despite a simulated broad Storage policy. Existing teacher library and broader portal migration/access checks also pass.
- `npm run lint` — passed with project React effect/dependency warnings, including the async screen-loading effect.
- `npm run build` — passed.
- `git diff --check` — passed.
- Browser-driven Stage 71 interaction was not run. Production migration and hosted frontend release remain pending.

## Deployment checkpoint

The versioned migration is `supabase/migrations/20261102000000_parent_learning_resource_access.sql`. Source pushes do not apply the migration or deploy the frontend. Apply the migration only through the approved backup/staging workflow and an explicit production deployment approval.
