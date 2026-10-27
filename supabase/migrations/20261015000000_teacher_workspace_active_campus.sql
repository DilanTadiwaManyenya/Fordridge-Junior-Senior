-- Stage 18: a teacher's class and subject capabilities follow the active
-- campus membership so a multi-campus teacher switches workspace explicitly.

create or replace function public.teacher_has_class_assignment(
  p_campus_id uuid,
  p_class_level text,
  p_class_stream text default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'teacher'
    and p_campus_id = public.my_campus_id()
    and p_class_level is not null
    and exists (
      select 1
      from public.teacher_class_assignments a
      left join public.school_classes c on c.id = a.class_id
      left join public.school_class_streams s on s.id = a.class_stream_id
      where a.teacher_id = auth.uid()
        and a.campus_id = p_campus_id
        and a.assignment_kind = 'class'
        and (
          (
            a.class_id is not null
            and c.campus_id = a.campus_id
            and c.is_active
            and lower(trim(c.class_level)) = lower(trim(p_class_level))
            and (
              a.class_stream_id is null
              or (
                s.class_id = c.id
                and s.is_active
                and lower(trim(s.stream_name)) = lower(trim(coalesce(p_class_stream, '')))
              )
            )
          )
          or (
            a.class_id is null
            and lower(trim(a.class_level)) = lower(trim(p_class_level))
            and (
              a.class_stream is null
              or lower(trim(a.class_stream)) = lower(trim(coalesce(p_class_stream, '')))
            )
          )
        )
    );
$$;
revoke all on function public.teacher_has_class_assignment(uuid,text,text) from public, anon;
grant execute on function public.teacher_has_class_assignment(uuid,text,text) to authenticated;

create or replace function public.teacher_has_subject_assignment(
  p_campus_id uuid,
  p_class_level text,
  p_class_stream text default null,
  p_subject text default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'teacher'
    and p_campus_id = public.my_campus_id()
    and p_class_level is not null
    and exists (
      select 1
      from public.teacher_class_assignments a
      left join public.school_classes c on c.id = a.class_id
      left join public.school_class_streams s on s.id = a.class_stream_id
      where a.teacher_id = auth.uid()
        and a.campus_id = p_campus_id
        and (a.assignment_kind = 'subject' or (a.assignment_kind = 'class' and nullif(trim(a.subject), '') is not null))
        and nullif(trim(a.subject), '') is not null
        and (p_subject is null or lower(trim(a.subject)) = lower(trim(p_subject)))
        and (
          (
            a.class_id is not null
            and c.campus_id = a.campus_id
            and c.is_active
            and lower(trim(c.class_level)) = lower(trim(p_class_level))
            and (
              a.class_stream_id is null
              or (
                s.class_id = c.id
                and s.is_active
                and lower(trim(s.stream_name)) = lower(trim(coalesce(p_class_stream, '')))
              )
            )
          )
          or (
            a.class_id is null
            and lower(trim(a.class_level)) = lower(trim(p_class_level))
            and (
              a.class_stream is null
              or lower(trim(a.class_stream)) = lower(trim(coalesce(p_class_stream, '')))
            )
          )
        )
    );
$$;
revoke all on function public.teacher_has_subject_assignment(uuid,text,text,text) from public, anon;
grant execute on function public.teacher_has_subject_assignment(uuid,text,text,text) to authenticated;
