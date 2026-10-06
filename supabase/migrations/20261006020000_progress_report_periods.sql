-- Optional reporting period fields for academic learner records.
-- Existing records remain intact; they can be categorised later by an administrator.
alter table public.learner_records
  add column if not exists academic_year integer,
  add column if not exists academic_term text;

alter table public.learner_records
  add constraint learner_records_academic_term_check
  check (academic_term is null or academic_term in ('Term 1', 'Term 2', 'Term 3')) not valid;

create index if not exists learner_records_progress_report_index
  on public.learner_records(student_id, academic_year, academic_term, event_date)
  where kind = 'academic';
