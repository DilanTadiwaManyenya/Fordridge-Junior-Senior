# Stage 69: Digital learning access policy proposal

## Status

**Proposal recorded; Fordridge owner approval is still required.** No learning-library feature, schema, storage bucket, permission, or school content was created by this stage.

Fordridge currently has no digital learning-resource tables, learning-library route, or private learning-file bucket. Existing class/subject assignments, learner records, guardian links, active-role policies, and audit facilities can support a scoped feature, but they do not yet authorize a learning-library workflow.

## Reliance reference

Read-only review of Reliance's learning-library design and operating guides found:

- PDF, DOC/DOCX, PPT/PPTX, JPEG, PNG, and WebP files, with a 10 MiB per-file limit and private storage buckets.
- Teachers publish within current class/subject allocations. Parents read published content for verified linked learners whose current campus/class/stream matches. Student access is not part of the approved Fordridge role matrix.
- A blank resource stream means all streams in that exact class and campus; it does not broaden access to another class or campus. Individual elective enrollment is not inferred from marks.
- Signed links are short-lived (60 seconds in the reference), are not stored as authorization, and cannot revoke a file already downloaded. Replacements retain prior finalized versions. Archive withdraws publication without deleting files or audit history.
- Abandoned uploads are reviewed before cleanup; age alone does not authorize deletion. Reliance has no automatic deletion of finalized versions under its documented retention procedure.

These are reference practices, not Fordridge-approved production settings.

## Proposed Fordridge defaults for owner review

| Decision | Proposed default | Fordridge-specific confirmation needed |
| --- | --- | --- |
| Teacher publishing | Teachers may draft, replace, and archive resources only inside their active assigned class/subject and verified campus scope. | Confirm the approved teacher allocation records for Junior and Senior resources. |
| Parent reading | Parents may read published resources only for currently active learners linked through a verified guardian relationship. | Confirm whether Fordridge wants parent access in the first release. |
| Student reading | Disabled, following the current role matrix. | Confirm if students should ever receive separate access. |
| Admin and support | Main Admin manages configuration and can audit both campuses. Campus Admin manages only an assigned campus if that role is enabled. Principal/accountant access is read-only and limited to a specifically approved campus scope. | Confirm which Fordridge roles actually exist and should receive oversight access; do not treat a broad `admin` claim as campus scope. |
| Audience | Resources are class/subject resources, not individual elective lists. | Confirm whether learner-subject enrollment must be added before any elective-only publishing. |
| Class/stream scope | A resource must have one exact campus and class/form. A null stream means all streams of that exact class only. No campus/class/stream is inferred from a file, teacher name, or old report. | Confirm this interpretation for Fordridge's Junior/Senior structure. Existing unallocated classes and streams remain unset. |
| Parent eligibility | Match the linked learner's current active enrollment and current class/stream; do not carry access automatically after promotion. Historical learning-resource access remains unavailable until enrollment-history rules are approved. | Confirm current-enrollment-only access or define a historical access period. |
| File types and size | PDF, DOC/DOCX, PPT/PPTX, JPEG, PNG, WebP; 10 MiB maximum; reject HTML, SVG, scripts, and executables. | Confirm the allowlist and file-size limit. |
| Preview/download | PDF and safe raster images may preview; Office formats download. No automatic file fetch when opening the list. | Confirm this is acceptable on family phones. |
| Storage | Separate private learning-library bucket; unique immutable object paths; validate extension, MIME and actual object metadata; finalize only after successful upload; use 60-second signed links and never store them in rows. | Confirm private storage and signed-link behavior. |
| Replacement/archive | Replacement creates a new version and keeps the old finalized version and audit history. Archive removes publication access but does not purge content. | Confirm whether any authorized permanent deletion process is required. |
| Retention | Keep finalized files, previous versions, and audit history until Fordridge approves a written schedule. Review abandoned reservations after 7 days; do not automatically delete based only on age. | Approve a retention period and name the responsible records owner before cleanup automation. |

## Security requirements before implementation

- Keep all resources and files private. Do not reuse Fordridge's public `product-images` bucket.
- Enforce role, assignment, active-enrollment, verified guardian, campus, class, and stream scope in database policies and guarded RPCs. UI filtering is not authorization.
- Check authorization when creating, editing, replacing, publishing, reading, and signing a file link. Allocation removal ends future teacher write access but does not erase published history.
- Reserve a unique upload path, upload without overwrite, verify stored size/MIME, and activate only after server-side finalization. A failed replacement leaves the prior file active.
- Do not cascade-delete a learning resource, finalized file, or audit history. Do not install automated object cleanup until Fordridge approves the retention schedule and a reviewed race-safe job.
- A short link expiry blocks new access after expiry; it cannot revoke already downloaded copies.

## Owner decisions needed to complete Stage 69

Please approve or revise the proposed defaults for:

1. **Audience and roles:** teacher publishing, verified-parent reading, no student access, and the exact admin/principal/accountant oversight roles.
2. **File policy:** the seven listed formats and 10 MiB maximum, with private storage and 60-second signed links.
3. **Scope:** exact-campus/class targeting, null stream meaning every stream in that class only, and parent access limited to the learner's current enrollment.
4. **Retention:** keep finalized versions/audits without automatic deletion until a written school retention period is approved; review unfinished uploads after seven days without automatic deletion.

No feature work should treat these proposals as approved Fordridge policy until the owner confirms them.

## Evidence and validation

The Fordridge gap review covered local routes, migrations, access matrix, Reliance reference notes, and current feature search. Reliance file/reference evidence is in `docs/learning-library-stage1.md`, `docs/learning-library-stage2.md`, `docs/learning-library-stage4.md`, `docs/learning-library-retention.md`, and `docs/learning-library-user-guide.md` in the read-only Reliance repository. No Reliance files or school data were changed or copied.

This is a documentation-only proposal. `git diff --check` is the applicable local validation. No app build, database migration, storage change, production change, or automated test was needed.
