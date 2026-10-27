# Stage 8: proposed Fordridge class catalogue

Date: 27 October 2026
Status: design implemented with an intentionally empty catalogue; school data stays unset
Starting Fordridge commit: 3f0fa3a
Related: Stage 7 access matrix is still awaiting owner approval.

## Current structure

Fordridge stores learner placement as nullable text on `profiles`: `campus_id`, `class_level`, and `class_stream`. `teacher_class_assignments` repeats `campus_id`, `class_level`, `class_stream` and optional `subject` as text. These fields support the current portal but have no class/stream foreign keys, canonical label constraints or capacity source. Each consuming page/RPC must match the same text semantics.

The existing two campus records are Fordridge Junior School and Fordridge Senior School. Profile class fields and admission numbers are optional. Existing records must not be backfilled with guessed classes or campus assignments. Historical report snapshots contain their own learner and campus references and must remain valid.

## Proposed logical model

Introduce a canonical parent class for each campus and level, with optional named streams below it. A whole-class teacher assignment points to the parent; a stream-specific assignment points to a stream under that parent. This lets one whole-class grant cover all current and future streams without inventing duplicate assignment rows.

| Proposed entity | Purpose and key rules |
| --- | --- |
| `school_classes` | Stable UUID, campus FK, canonical level key, display name, active status, optional sort order. One normalized level per campus. No school-specific level is seeded until approved. |
| `school_class_streams` | Stable UUID, parent class FK, canonical stream key, display name, optional positive capacity, active status and sort order. Stream key is unique within class. A class can have no streams. |
| Learner placement | Add nullable `class_id` and `class_stream_id` references on learner profiles or a current-enrolment relation if Stage 12 requires history. Composite consistency guarantees stream belongs to class and class campus equals learner campus. Preserve the existing text fields during an additive migration and rollback window. |
| Teacher assignment | Extend the assignment model to reference `class_id`; optional `class_stream_id` means that one stream, while null means the whole class. Keep subject as a separate capability dimension if required by Stage 10/11. Uniqueness must handle NULL correctly. |
| Capacity | Store optional capacity on stream when streams exist, or on class when no streams exist. Never treat missing capacity as zero or a hard-coded default. Validate a new value against current active enrolment before saving. |
| Placement history | Keep historical movement outside the current profile fields so rollover never overwrites past context. Stage 12 designs placement history together with report contexts before a promotion workflow is added. |

For multi-column consistency, use composite unique keys/FKs (for example campus plus class id; class plus stream id) or guarded triggers/RPCs. The database must reject a learner whose campus differs from the selected class and a stream belonging to another class. Client form options are convenience only.

## Assignment behaviour

- A class-level assignment (no stream) covers every stream in that class and learners with no stream.
- A stream-level assignment covers only that stream.
- Do not allow a teacher the same class at both whole-class and stream-specific scope; the whole-class row already covers the streams.
- Two duplicate assignments are rejected even when subject is NULL. If subject allocations are introduced, permit different subjects only when the school authorises that model.
- Teacher/campus eligibility is checked against trusted staff assignment grants, not a submitted `teacher_id` or `campus_id` alone.
- Removing or deactivating a class/stream is a reviewed action. Existing students, assignments, historical reports and fee records cannot be cascaded away.

## Read-only backfill and migration plan

Before migration, produce counts and a review file without exposing sensitive student fields:

1. Count active/inactive learner profiles by campus and whether `class_level`/`class_stream` is missing.
2. List distinct normalized `(campus, class_level, class_stream)` values with counts for school staff to map. Protect names and admission numbers; produce counts or a restricted school-admin report.
3. Identify level spellings that differ only by case/spacing and blank strings that should map to null.
4. Find records with unknown campus, invalid enrollment status, duplicate admission numbers or duplicate proposed class/stream mappings.
5. Compare every teacher assignment to the proposed campus, canonical level and stream catalogue; flag ambiguous rows for review rather than converting them automatically.
6. Check timetable and report settings/grading keys for level labels that need aliases. Do not change issued report snapshot content.
7. Preview class/stream enrolment counts against proposed capacities, without rejecting rows when capacity is not configured.
8. Have authorised school staff approve the canonical level and stream mapping before assigning new FKs.

Migration should be additive and transactional: create catalogues and indexes, insert only approved class/stream values, map unambiguous active and historical references, record unresolved rows for review, validate counts and constraints, then make new writes use IDs. Retain old text fields until all screens/RPCs and exports use the new IDs and a rollback window ends. Do not delete or rewrite enrolment, fee, mark, report, guardian or audit data as a side effect.

No live rows were read for this design. Example count query for an authorised local/test database:

```sql
select c.code as campus_code,
       nullif(lower(trim(p.class_level)), '') as level_key,
       nullif(lower(trim(p.class_stream)), '') as stream_key,
       coalesce(p.enrollment_status, 'unset') as learner_status,
       count(*) as learner_count
from public.profiles p
left join public.campuses c on c.id = p.campus_id
where p.role = 'student'
group by c.code, nullif(lower(trim(p.class_level)), ''),
         nullif(lower(trim(p.class_stream)), ''),
         coalesce(p.enrollment_status, 'unset')
order by campus_code, level_key, stream_key, learner_status;
```

This query is a review aid only. Normalized spellings that collide need human confirmation; it does not decide the official class catalogue.

## Relationships to later stages

- Stage 7's role/campus scope approval must precede access-policy changes.
- Stage 9 adds empty catalogue management; approved names are entered later, without a seeded list.
- Stage 10 migrates teacher class assignments to canonical identifiers.
- Stages 11 and 36 scope subject allocation and Markbook to class IDs.
- Stages 27–35 use the catalogue for import, export, learner changes and parent access.
- Stages 40–56 depend on reporting-period and placement history designs. Do not use current class to reconstruct a prior report's class.
- Stages 62–68 may use campus/class configuration for POS scope only after the external product boundary is decided.

## School choices before adding catalogue values or linking existing records

1. Approve official level labels per Junior/Senior campus, including ECD, Grade, form and Sixth Form names.
2. Confirm which levels have streams and the exact official stream labels/capitalisation.
3. Set capacity per level/stream, or confirm that capacity stays unset until staff enter approved values.
4. Confirm whether graduated/transferred learners retain a current class, become unassigned, or use an exit placement while their historical placement remains queryable.
5. Confirm whether any individual class can belong to both campuses. The default is each class belongs to exactly one.
6. Confirm whether class-level subjects should be separate subject-allocation rows, and whether the same teacher may hold multiple subjects for one class.

Fordridge directed that class names, streams and capacities remain unset while stream allocations are unknown. Stage 9 implements the empty catalogue and requires a school admin to enter each confirmed value later. The Stage 7 role/campus matrix is still awaiting owner approval; the current Classes page keeps Fordridge's existing admin-only access model. No live rows were read or changed.
