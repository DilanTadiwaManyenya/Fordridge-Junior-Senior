-- Apply before deploying the portal UI. All elevated writes verify the caller.
alter table public.fee_transactions add column request_id uuid unique;
create function public.record_fee_payment(p_fee_id uuid, p_amount numeric, p_method text, p_reference text, p_request_id uuid)
returns public.fee_transactions language plpgsql security definer set search_path = public as $$
declare fee public.fee_records; tx public.fee_transactions;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Administrator access required'; end if;
  if p_request_id is null then raise exception 'Payment request ID required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into tx from public.fee_transactions where request_id = p_request_id;
  if found then
    if tx.fee_record_id <> p_fee_id or tx.amount <> p_amount or tx.payment_method <> p_method or tx.reference is distinct from nullif(trim(p_reference),'') then
      raise exception 'This request ID was already used for another payment';
    end if;
    return tx;
  end if;
  select * into fee from public.fee_records where id = p_fee_id for update;
  if not found then raise exception 'Fee record not found'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) or p_amount > fee.amount - fee.paid_amount then
    raise exception 'Payment must be positive and no greater than the outstanding balance';
  end if;
  insert into public.fee_transactions(fee_record_id,campus_id,amount,payment_method,reference,recorded_by,request_id)
    values(fee.id,fee.campus_id,p_amount,p_method,nullif(trim(p_reference),''),auth.uid(),p_request_id) returning * into tx;
  update public.fee_records set paid_amount = paid_amount + p_amount,
    status = case when paid_amount + p_amount >= amount then 'paid' else 'pending' end,
    payment_reference = coalesce(tx.reference,payment_reference), updated_at = now() where id = fee.id;
  return tx;
end $$;
revoke all on function public.record_fee_payment(uuid,numeric,text,text,uuid) from public;
grant execute on function public.record_fee_payment(uuid,numeric,text,text,uuid) to authenticated;
-- Payment ledger inserts must use the transactional function.
drop policy "admins record fee transactions" on public.fee_transactions;
revoke insert, update, delete on public.fee_transactions from authenticated;
revoke update on public.fee_records from authenticated;

create function public.admin_update_profile(p_id uuid, p_name text, p_campus uuid, p_admission text, p_class text, p_stream text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Administrator access required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Name is required'; end if;
  update public.profiles set full_name = trim(p_name), campus_id = p_campus,
    admission_number = case when role='student' then nullif(trim(p_admission),'') else admission_number end,
    class_level = case when role='student' then nullif(trim(p_class),'') else class_level end,
    class_stream = case when role='student' then nullif(trim(p_stream),'') else class_stream end,
    enrollment_status = case when role='student' then nullif(p_status,'') else enrollment_status end
    where id=p_id;
  if not found then raise exception 'Profile not found'; end if;
  insert into public.audit_trail(actor_id,entity_type,entity_id,action) values(auth.uid(),'profile',p_id,'updated');
end $$;
revoke all on function public.admin_update_profile(uuid,text,uuid,text,text,text,text) from public;
grant execute on function public.admin_update_profile(uuid,text,uuid,text,text,text,text) to authenticated;

create table public.learner_records (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id),
  kind text not null check(kind in ('attendance','academic','wellbeing')), event_date date not null,
  title text not null check(length(trim(title)) > 0), notes text not null default '',
  attendance_status text check(attendance_status in ('present','absent','late','excused')),
  score numeric, max_score numeric, created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  check(kind <> 'attendance' or attendance_status is not null),
  check((score is null and max_score is null) or (score is not null and max_score is not null and score >= 0 and max_score > 0 and score <= max_score))
);
create unique index learner_attendance_per_day on public.learner_records(student_id,event_date) where kind='attendance';
alter table public.learner_records enable row level security;
create policy "admins manage learner records" on public.learner_records for all to authenticated
  using(public.my_role()='admin') with check(public.my_role()='admin' and created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=student_id and p.role='student'));
create policy "learners and guardians read nonconfidential records" on public.learner_records for select to authenticated
  using(kind <> 'wellbeing' and (student_id=auth.uid() or exists(select 1 from public.student_guardians g where g.student_id=learner_records.student_id and g.parent_id=auth.uid())));
grant select,insert,update,delete on public.learner_records to authenticated;

-- Parents can resolve their linked learner's name in fee and record views.
create policy "guardians read linked learner profiles" on public.profiles for select to authenticated
  using(exists(select 1 from public.student_guardians g where g.student_id=profiles.id and g.parent_id=auth.uid()));

-- Draft announcements must not be visible to ordinary campus members.
drop policy "announcements campus read" on public.announcements;
create policy "published announcements campus read" on public.announcements for select to authenticated
  using(published_at <= now() and (campus_id=public.my_campus_id() or exists(
    select 1 from public.student_guardians g join public.profiles p on p.id=g.student_id
    where g.parent_id=auth.uid() and p.campus_id=announcements.campus_id)));

alter table public.timetable add column class_level text, add column class_stream text, add column room text;
drop policy "timetable campus read" on public.timetable;
create policy "timetable relevant audience" on public.timetable for select to authenticated using(
  (audience_role is null or audience_role=public.my_role() or (public.my_role()='parent' and audience_role='student')) and (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.campus_id=timetable.campus_id
      and (timetable.class_level is null or timetable.class_level=p.class_level)
      and (timetable.class_stream is null or timetable.class_stream=p.class_stream))
    or exists(select 1 from public.student_guardians g join public.profiles p on p.id=g.student_id
      where g.parent_id=auth.uid() and p.campus_id=timetable.campus_id
      and (timetable.class_level is null or timetable.class_level=p.class_level)
      and (timetable.class_stream is null or timetable.class_stream=p.class_stream))));
