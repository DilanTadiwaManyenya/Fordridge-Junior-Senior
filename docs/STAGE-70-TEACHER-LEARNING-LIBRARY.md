# Stage 70 — Teacher Learning Library

## Status

Implemented and locally verified. The production migration and hosted frontend release remain pending. No production database, Storage bucket, or Reliance repository was changed.

## Delivered

- Added a teacher-only Learning library route and Workspace navigation item.
- Teachers can create and edit drafts only within a current subject allocation in their active campus. The resource keeps a snapshot of campus, class, stream (including a confirmed null stream), subject, year, and term.
- Draft creation, edit, publishing, archiving, file reservation, and file finalization run through guarded database functions. Client-side direct writes are revoked.
- Added private `learning-library` Storage configuration for PDF, DOC/DOCX, PPT/PPTX, JPEG, PNG, and WebP files up to 10 MiB. Files use unique immutable paths, `upsert: false`, stored size/MIME verification, and 60-second signed links.
- The previous finalized file stays in the database history when a verified replacement is activated. Failed replacement validation leaves the current file active.
- Added audit records for resource and file reservation/finalization/state changes. Drafts and finalized files are not automatically deleted.
- Added restrictive Storage policies for this bucket, so unrelated broad permissive Storage policies cannot widen its read/upload access. Update and delete remain blocked for the bucket.

## Access and workflow boundaries

- Teacher access follows the current active teacher role, campus, subject/class allocation, and an open current reporting period for draft writes and publication.
- A whole-class allocation retains a null stream as all streams in that exact class; the migration does not seed classes, streams, or allocations.
- Teachers can archive their own resource in the matching active campus after an allocation is removed. They cannot edit or publish it after that removal.
- Published resources cannot be edited or receive a file replacement through the Stage 70 RPCs.
- Parent and student reads are not enabled in this stage. Stage 71 will add verified-parent reads for current enrollment. Stage 72 owns the reviewed file cleanup lifecycle; no automatic cleanup is installed.

## Validation

- `node scripts/test-portal.mjs` — passed. Added isolated PGlite checks for synthetic current-period lookup; class/subject/campus assignment boundaries; unchanged null stream; direct write denial; private Storage access despite a simulated broad legacy policy; unreserved object rejection; reservation idempotency and payload mismatch; unsupported format rejection; stored size/MIME mismatch; replacement history; publish gating; published-resource immutability; closed-period write rejection; and parent/student/other-teacher read denial.
- `npm run build` — passed.
- `npm run lint` — passed with existing project React effect/dependency warnings; the Stage 70 screen adds the same async-loading effect warning pattern.
- Browser-driven Stage 70 interaction was not run in this checkpoint. Existing production migration / hosted frontend deployment remains pending.

## Deployment checkpoint

The versioned migration is `supabase/migrations/20261101000000_teacher_learning_library.sql`. It creates schema objects and bucket policies locally only. Apply it to production only through the approved backup/staging workflow and an explicit production deployment approval. Push of the source commit does not apply the migration or deploy the frontend.
