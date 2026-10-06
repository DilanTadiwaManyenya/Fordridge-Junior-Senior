create index if not exists learner_records_report_period_idx
  on public.learner_records (academic_year, academic_term, student_id)
  where kind = 'academic';
create index if not exists profiles_report_class_idx
  on public.profiles (campus_id, class_level, class_stream)
  where role = 'student';
create index if not exists report_publications_period_idx
  on public.report_publications (campus_id, academic_year, academic_term);
create index if not exists report_term_settings_period_idx
  on public.report_term_settings (campus_id, academic_year, academic_term);
