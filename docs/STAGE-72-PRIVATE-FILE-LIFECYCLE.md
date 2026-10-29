# Stage 72 — Private file lifecycle

## Delivered

- Draft resources can select a replacement attachment. The previous finalized private file remains active until the replacement upload is verified and finalized.
- Teachers can see prior finalized attachment versions and can resume an incomplete reservation after reselecting the exact same filename, size, and approved file type.
- Incomplete reservations are surfaced on their draft. Reservations older than seven days are flagged for review; they remain retained and are never automatically deleted.
- Teacher-owned resources and their file history remain visible when a teaching allocation is no longer active, while editing, uploading, publishing, and resuming are disabled without an active allocation/current period.
- Existing private storage, server-side authorization, replacement history, file type/size limits, and short-lived signed links are preserved. No production schema, retention policy, or storage configuration changed.

## Verification

- `node scripts/test-portal.mjs` — passed, including allowed file validation, MIME mismatch, exact reservation matching, and the seven-day review threshold.
- `npm run build` — passed; Vite emitted the existing large JavaScript chunk warning.
- `npx oxlint src/portal/TeacherLearningLibrary.jsx src/portal/learning-library-file-workflow.js` — completed with the existing React `set-state-in-effect` warning in `TeacherLearningLibrary.jsx`.
- `git diff --check` — passed.
- Browser interaction was not run.

## Release status

No database migration is required for this stage. Production database and hosted frontend were not changed; deployment remains pending the normal release process.

## Git checkpoint

Source commit: [f35ba0f](https://github.com/DilanTadiwaManyenya/Fordridge-Junior-Senior/commit/f35ba0f). Documentation commit: pending.
