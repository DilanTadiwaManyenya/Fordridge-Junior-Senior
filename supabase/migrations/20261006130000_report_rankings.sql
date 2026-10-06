create or replace function public.report_class_ranking(p_student_id uuid, p_academic_year integer, p_academic_term text)
returns table(class_rank bigint, class_size bigint) language plpgsql security definer set search_path=public as $$
declare learner public.profiles;
begin
  select * into learner from public.profiles where id=p_student_id and role='student';
  if not found then raise exception 'Learner not found'; end if;
  if not (public.my_role()='admin' or auth.uid()=p_student_id or exists(select 1 from public.student_guardians g where g.student_id=p_student_id and g.parent_id=auth.uid()) or (public.my_role()='teacher' and exists(select 1 from public.teacher_class_assignments a where a.teacher_id=auth.uid() and a.campus_id=learner.campus_id and a.class_level=learner.class_level and a.class_stream is not distinct from learner.class_stream))) then raise exception 'Not allowed'; end if;
  return query with averages as (select r.student_id, avg(r.score/r.max_score*100) as average_mark from public.learner_records r join public.profiles p on p.id=r.student_id where r.kind='academic' and r.academic_year=p_academic_year and r.academic_term=p_academic_term and p.campus_id=learner.campus_id and p.class_level=learner.class_level and p.class_stream is not distinct from learner.class_stream group by r.student_id), ranked as (select student_id, rank() over(order by average_mark desc) as rank_value, count(*) over() as size_value from averages) select rank_value,size_value from ranked where student_id=p_student_id;
end $$;
revoke all on function public.report_class_ranking(uuid,integer,text) from public;
grant execute on function public.report_class_ranking(uuid,integer,text) to authenticated;
