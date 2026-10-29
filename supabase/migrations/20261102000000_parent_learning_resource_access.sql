-- Stage 71: parents can read only published resources matching an actively
-- enrolled learner linked to the signed-in parent account.
begin;

create index if not exists student_guardians_parent_student_idx
  on public.student_guardians(parent_id,student_id);

create function public.can_read_learning_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select exists (
    select 1 from public.learning_resources r
    where r.id=p_resource_id and (
      (public.my_role()='teacher' and public.can_read_teacher_learning_resource(r.id))
      or (
        public.my_role()='parent' and r.state='published'
        and exists (
          select 1
          from public.student_guardians g
          join public.profiles learner on learner.id=g.student_id
          where g.parent_id=auth.uid()
            and learner.id is not null
            and learner.role='student'
            and learner.enrollment_status='active'
            and learner.campus_id=r.campus_id
            and learner.class_level=r.class_level
            and (r.class_stream is null or learner.class_stream is not distinct from r.class_stream)
        )
      )
    )
  );
$$;

drop policy "Teachers read own learning resources" on public.learning_resources;
create policy "Teachers and eligible parents read learning resources"
  on public.learning_resources for select to authenticated
  using (public.can_read_learning_resource(id));

drop policy "Teachers read own learning file metadata" on public.learning_resource_files;
create policy "Teachers and eligible parents read learning file metadata"
  on public.learning_resource_files for select to authenticated
  using (
    (public.my_role()='teacher' and public.can_read_teacher_learning_resource(resource_id))
    or (public.my_role()='parent' and ready and active and public.can_read_learning_resource(resource_id))
  );

create or replace function public.portal_storage_file_access(p_bucket text,p_path text,p_write boolean)
returns boolean
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select p_bucket='learning-library' and exists (
    select 1
    from public.learning_resource_files f
    join public.learning_resources r on r.id=f.resource_id
    join public.reporting_periods p on p.id=r.reporting_period_id
    where f.bucket_id=p_bucket and f.object_path=p_path
      and case when p_write then
        public.my_role()='teacher' and r.state='draft' and p.period_status='open' and p.is_current
        and not f.ready and not f.active and f.uploaded_by=auth.uid()
        and public.can_manage_learning_resource(r.id)
      else
        f.ready and f.active and public.can_read_learning_resource(r.id)
      end
  );
$$;

revoke all on function public.can_read_learning_resource(uuid) from public,anon;
grant execute on function public.can_read_learning_resource(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
