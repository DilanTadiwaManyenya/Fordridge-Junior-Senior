# Formal report workflow

Fordridge formal reports are treated as an issued school record rather than a live view of changing marks.

## Release sequence

1. Teachers enter academic marks for their assigned classes.
2. Administrators configure grade bands, approval names, and the next-term date.
3. Report readiness checks confirm marks, grade bands, and approvals are present.
4. An administrator publishes the campus, year, and term.
5. The release is audited and an in-portal announcement is sent to learners and parents.
6. The system creates protected, read-only learner snapshots for the released period.

## Snapshot contents

Each official report snapshot retains:

- Assessment marks and the released average
- Overall grade and class position
- Subject-teacher initials
- Class Teacher and Head of School approval names
- Release date and report period

This prevents later operational edits from silently changing an already-issued report.

## Access model

- Administrators can configure and release reports.
- Teachers can access authorised learner reports for their assigned classes.
- Learners can access their own reports.
- Parents can access reports for linked learners.
- Row Level Security enforces these boundaries in Supabase.

## Relevant portal pages

| Page | Purpose |
| --- | --- |
| Report settings | Approval names and next-term date |
| Grade bands | Campus grading scale |
| Report readiness | Pre-release validation |
| Report release | Publish or return a period to draft |
| Report archive | Released period register |
| Official reports | Read-only issued report snapshots |
