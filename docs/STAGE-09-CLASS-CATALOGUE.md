# Stage 9: empty class catalogue and admin screen

Date: 27 October 2026
Scope: create a catalogue workspace without preloading school-specific values

## Delivered

- Added an additive migration defining `school_classes` and optional `school_class_streams`.
- Class names are unique within a campus after trimming and case normalisation. Stream names are unique within a class using the same rule.
- Blank names are rejected. Stream capacity is nullable; any later configured value must be positive.
- Both tables use RLS. Writes and reads in the management page require Fordridge's existing admin role. This does not add principal/accountant roles or campus-specific admin grants.
- Added the **Classes** page and navigation entry under **Academic services**.
- Admins can create a confirmed class, add a confirmed stream later, and deactivate/reactivate entries. Records are deactivated instead of hard-deleted.
- The class/stream catalogue starts empty. The migration seeds no class labels, streams, capacities or placements. Nothing was added from assumptions about Fordridge's allocations.

## Access boundary

This page uses Fordridge's current admin role because the owner has not yet approved the Stage 7 role/campus matrix. Existing admins can manage entries for either campus, consistent with the broad admin policy used elsewhere in the current schema. Campus-admin separation and teacher assignment access are not implemented here; they remain subject to the Stage 7 approval and later stages.

## Data compatibility

Existing `profiles.class_level`, `profiles.class_stream` and `teacher_class_assignments` text fields remain unchanged. This stage does not attach existing learners or teacher assignments to catalogue IDs. Stage 10 must design the text-to-ID assignment migration and check collisions before changing any records.

## Checks and remaining verification

- Source reviewed for route guards, admin-only navigation, duplicate handling, soft deactivation and empty initial state.
- No class/stream rows were created.
- This stage did not run build, lint, database tests or browser tests. The Stage 5 isolated database suite passes after the report-signatory repair; it has not been rerun against this new migration. Chromium remains unavailable for the browser suite.
- The schema migration is local and not applied to Supabase. Live RLS and production migration state remain unverified.

The user confirmed classes, streams and capacities should remain unset until Fordridge knows the stream allocations. Future school-approved names are entered explicitly in the page; no default list is assumed.
