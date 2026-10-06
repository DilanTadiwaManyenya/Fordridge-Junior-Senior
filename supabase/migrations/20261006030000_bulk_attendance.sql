create or replace function public.record_bulk_attendance(p_event_date date, p_entries jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare entry jsonb; count_saved integer := 0;
begin
  if public.my_role() not in ('admin','teacher') then raise exception 'Staff access required'; end if;
  for entry in select value from jsonb_array_elements(p_entries) loop
    if not exists (select 1 from public.profiles p where p.id=(entry->>'student_id')::uuid and p.role='student' and (public.my_role()='admin' or p.campus_id=public.my_campus_id())) then raise exception 'Learner is outside your campus'; end if;
    insert into public.learner_records(student_id,kind,event_date,title,attendance_status,created_by)
      values((entry->>'student_id')::uuid,'attendance',p_event_date,'Daily attendance',entry->>'attendance_status',auth.uid())
      on conflict (student_id,event_date) where kind='attendance' do update set attendance_status=excluded.attendance_status,created_by=auth.uid(),created_at=now();
    count_saved := count_saved + 1;
  end loop;
  return count_saved;
end $$;
revoke all on function public.record_bulk_attendance(date,jsonb) from public;
grant execute on function public.record_bulk_attendance(date,jsonb) to authenticated;
