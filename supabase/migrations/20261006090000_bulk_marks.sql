create or replace function public.record_bulk_marks(p_title text,p_event_date date,p_academic_year integer,p_academic_term text,p_max_score numeric,p_entries jsonb)
returns integer language plpgsql security definer set search_path=public as $$ declare entry jsonb; count_saved integer:=0; begin
  if public.my_role() not in ('admin','teacher') then raise exception 'Staff access required'; end if;
  if p_title is null or length(trim(p_title))=0 or p_max_score is null or p_max_score<=0 then raise exception 'Assessment details are invalid'; end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if (entry->>'score')::numeric < 0 or (entry->>'score')::numeric > p_max_score then raise exception 'A mark is outside the allowed range'; end if;
    if not exists(select 1 from public.profiles p where p.id=(entry->>'student_id')::uuid and p.role='student' and (public.my_role()='admin' or (p.campus_id=public.my_campus_id() and exists(select 1 from public.teacher_class_assignments a where a.teacher_id=auth.uid() and a.campus_id=p.campus_id and a.class_level=p.class_level and a.class_stream is not distinct from p.class_stream)))) then raise exception 'Learner is outside an assigned class'; end if;
    insert into public.learner_records(student_id,kind,event_date,title,score,max_score,academic_year,academic_term,created_by) values((entry->>'student_id')::uuid,'academic',p_event_date,trim(p_title),(entry->>'score')::numeric,p_max_score,p_academic_year,p_academic_term,auth.uid()); count_saved:=count_saved+1;
  end loop; return count_saved; end $$;
revoke all on function public.record_bulk_marks(text,date,integer,text,numeric,jsonb) from public;
grant execute on function public.record_bulk_marks(text,date,integer,text,numeric,jsonb) to authenticated;
