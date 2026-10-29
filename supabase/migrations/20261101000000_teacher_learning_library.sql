-- Stage 70: teacher learning resources with assigned-scope checks and private files.
begin;

create table public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  allocation_id uuid references public.teacher_class_assignments(id) on delete set null,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  class_level text not null check (length(btrim(class_level)) between 1 and 80),
  class_stream text check (class_stream is null or length(btrim(class_stream)) between 1 and 80),
  subject text not null check (length(btrim(subject)) between 1 and 160),
  academic_year integer not null check (academic_year between 2000 and 2200),
  academic_term text not null check (academic_term in ('Term 1','Term 2','Term 3')),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 10000),
  state text not null default 'draft' check (state in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_resources_teacher_idx on public.learning_resources(teacher_id,campus_id,created_at desc);
create index learning_resources_scope_idx on public.learning_resources(campus_id,class_level,class_stream,academic_year,academic_term,state,published_at desc);

create table public.learning_resource_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  request_payload jsonb not null,
  resource_id uuid not null references public.learning_resources(id) on delete restrict,
  bucket_id text not null default 'learning-library' check (bucket_id='learning-library'),
  extension text not null check (extension in ('pdf','doc','docx','ppt','pptx','jpg','jpeg','png','webp')),
  original_name text not null check (length(original_name) between 1 and 240),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null,
  ready boolean not null default false,
  active boolean not null default false,
  object_path text generated always as (resource_id::text||'/'||id::text||'.'||extension) stored,
  created_at timestamptz not null default now(),
  check (not active or ready),
  check ((extension='pdf' and mime_type='application/pdf')
    or (extension='doc' and mime_type='application/msword')
    or (extension='docx' and mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    or (extension='ppt' and mime_type='application/vnd.ms-powerpoint')
    or (extension='pptx' and mime_type='application/vnd.openxmlformats-officedocument.presentationml.presentation')
    or (extension in ('jpg','jpeg') and mime_type='image/jpeg')
    or (extension='png' and mime_type='image/png')
    or (extension='webp' and mime_type='image/webp')),
  unique(bucket_id,object_path)
);
create unique index learning_resource_one_active_file on public.learning_resource_files(resource_id) where active;
create index learning_resource_files_resource_idx on public.learning_resource_files(resource_id,created_at desc);

alter table public.learning_resources enable row level security;
alter table public.learning_resource_files enable row level security;
revoke all on public.learning_resources,public.learning_resource_files from public,anon,authenticated;
grant select on public.learning_resources,public.learning_resource_files to authenticated;

create function public.learning_teacher_allocation(p_allocation_id uuid,p_teacher_id uuid,p_campus_id uuid,p_class_level text,p_class_stream text,p_subject text)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select p_teacher_id=auth.uid() and public.my_role()='teacher' and p_campus_id=public.my_campus_id()
    and exists(select 1 from public.teacher_class_assignments a
      where a.id=p_allocation_id and a.teacher_id=p_teacher_id and a.campus_id=p_campus_id
        and lower(trim(a.class_level))=lower(trim(p_class_level))
        and a.class_stream is not distinct from p_class_stream
        and lower(trim(a.subject))=lower(trim(p_subject))
        and (a.assignment_kind='subject' or (a.assignment_kind='class' and nullif(trim(a.subject),'') is not null))
        and public.teacher_has_subject_assignment(p_campus_id,p_class_level,p_class_stream,p_subject));
$$;

create function public.can_manage_learning_resource(p_resource_id uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(select 1 from public.learning_resources r
    where r.id=p_resource_id and public.learning_teacher_allocation(r.allocation_id,r.teacher_id,r.campus_id,r.class_level,r.class_stream,r.subject));
$$;

create function public.can_read_teacher_learning_resource(p_resource_id uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select public.my_role()='teacher' and exists(select 1 from public.learning_resources r
    where r.id=p_resource_id and r.teacher_id=auth.uid() and r.campus_id=public.my_campus_id());
$$;

create function public.teacher_learning_current_period(p_campus_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare period public.reporting_periods;
begin
  if auth.uid() is null or public.my_role() is distinct from 'teacher' or public.my_campus_id() is distinct from p_campus_id
    or not exists(select 1 from public.teacher_class_assignments a where a.teacher_id=auth.uid() and a.campus_id=p_campus_id
      and nullif(trim(a.subject),'') is not null) then
    raise exception 'A teacher assignment in the active campus is required' using errcode='42501';
  end if;
  select * into period from public.reporting_periods where campus_id=p_campus_id and is_current and period_status='open';
  if not found then return null; end if;
  return jsonb_build_object('id',period.id,'campus_id',period.campus_id,'academic_year',period.academic_year,'academic_term',period.academic_term);
end;
$$;

create function public.create_teacher_learning_resource(p_allocation_id uuid,p_title text,p_description text default '')
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare allocation public.teacher_class_assignments; period public.reporting_periods; resource_id uuid; body text:=coalesce(p_description,'');
begin
  if auth.uid() is null or public.my_role() is distinct from 'teacher' then raise exception 'Teacher access required' using errcode='42501'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 200 or length(body)>10000 then
    raise exception 'Enter a title up to 200 characters and description up to 10000 characters' using errcode='22023';
  end if;
  select * into allocation from public.teacher_class_assignments where id=p_allocation_id and teacher_id=auth.uid()
    and campus_id=public.my_campus_id() and nullif(trim(subject),'') is not null
    and (assignment_kind='subject' or (assignment_kind='class' and nullif(trim(subject),'') is not null));
  if not found or not public.teacher_has_subject_assignment(allocation.campus_id,allocation.class_level,allocation.class_stream,allocation.subject) then
    raise exception 'A current subject allocation in your active campus is required' using errcode='42501';
  end if;
  select * into period from public.reporting_periods where campus_id=allocation.campus_id and is_current and period_status='open' for share;
  if not found then raise exception 'There is no open current reporting period for this campus'; end if;
  insert into public.learning_resources(teacher_id,allocation_id,reporting_period_id,campus_id,class_level,class_stream,subject,
    academic_year,academic_term,title,description)
  values(auth.uid(),allocation.id,period.id,allocation.campus_id,allocation.class_level,allocation.class_stream,allocation.subject,
    period.academic_year,period.academic_term,btrim(p_title),body)
  returning id into resource_id;
  return resource_id;
end;
$$;

create function public.update_teacher_learning_resource(p_resource_id uuid,p_title text,p_description text)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare resource public.learning_resources;
begin
  if p_title is null or length(btrim(p_title)) not between 1 and 200 or p_description is null or length(p_description)>10000 then
    raise exception 'Enter a title up to 200 characters and description up to 10000 characters' using errcode='22023';
  end if;
  select * into resource from public.learning_resources where id=p_resource_id for update;
  if not found or resource.state<>'draft' or not public.can_manage_learning_resource(resource.id) then
    raise exception 'A current teaching allocation is required to edit this resource' using errcode='42501';
  end if;
  if not exists(select 1 from public.reporting_periods where id=resource.reporting_period_id and period_status='open' and is_current) then
    raise exception 'The resource reporting period is closed or no longer current';
  end if;
  update public.learning_resources set title=btrim(p_title),description=p_description,updated_at=now() where id=resource.id;
end;
$$;

create function public.set_teacher_learning_resource_state(p_resource_id uuid,p_state text)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare resource public.learning_resources;
begin
  if p_state is null or p_state not in ('published','archived') then raise exception 'Choose publish or archive' using errcode='22023'; end if;
  select * into resource from public.learning_resources where id=p_resource_id for update;
  if not found or resource.teacher_id<>auth.uid() or resource.campus_id is distinct from public.my_campus_id()
    or public.my_role() is distinct from 'teacher' then
    raise exception 'Teacher-owned resource not found' using errcode='42501';
  end if;
  if p_state='archived' then
    if resource.state='archived' then return; end if;
    update public.learning_resources set state='archived',updated_at=now() where id=resource.id;
    return;
  end if;
  if resource.state<>'draft' or not public.can_manage_learning_resource(resource.id) then
    raise exception 'Only a draft within your current teaching allocation can be published' using errcode='42501';
  end if;
  if not exists(select 1 from public.reporting_periods where id=resource.reporting_period_id and period_status='open' and is_current) then
    raise exception 'The resource reporting period is closed or no longer current';
  end if;
  if not exists(select 1 from public.learning_resource_files where resource_id=resource.id and ready and active) then
    raise exception 'Upload and finalize a file before publishing';
  end if;
  update public.learning_resources set state='published',published_at=now(),updated_at=now() where id=resource.id;
end;
$$;

create function public.reserve_teacher_learning_file(p_request_id uuid,p_resource_id uuid,p_original_name text,p_extension text,p_mime_type text,p_size_bytes bigint)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare request_payload jsonb; prior public.learning_resource_files; resource public.learning_resources; file_row public.learning_resource_files;
begin
  if auth.uid() is null or p_request_id is null or p_resource_id is null then raise exception 'File request and resource are required' using errcode='22023'; end if;
  if p_original_name is null or length(p_original_name) not between 1 and 240 or p_size_bytes is null or p_size_bytes not between 1 and 10485760 then
    raise exception 'Choose a file from 1 byte to 10 MiB with a name up to 240 characters' using errcode='22023';
  end if;
  request_payload:=jsonb_build_object('resource_id',p_resource_id,'original_name',p_original_name,'extension',lower(p_extension),'mime_type',p_mime_type,'size_bytes',p_size_bytes);
  perform pg_advisory_xact_lock(hashtextextended('learning-file:'||p_request_id::text,0));
  select * into prior from public.learning_resource_files where request_id=p_request_id;
  if found then
    if prior.uploaded_by<>auth.uid() or prior.request_payload is distinct from request_payload then raise exception 'File request ID was already used for a different file' using errcode='22023'; end if;
    return jsonb_build_object('id',prior.id,'bucket_id',prior.bucket_id,'object_path',prior.object_path,'original_name',prior.original_name,
      'mime_type',prior.mime_type,'size_bytes',prior.size_bytes,'ready',prior.ready,'active',prior.active);
  end if;
  select * into resource from public.learning_resources where id=p_resource_id for update;
  if not found or resource.state<>'draft' or not public.can_manage_learning_resource(resource.id) then
    raise exception 'A current teaching allocation is required to upload this file' using errcode='42501';
  end if;
  if not exists(select 1 from public.reporting_periods where id=resource.reporting_period_id and period_status='open' and is_current) then
    raise exception 'The resource reporting period is closed or no longer current';
  end if;
  insert into public.learning_resource_files(request_id,request_payload,resource_id,extension,original_name,mime_type,size_bytes,uploaded_by)
    values(p_request_id,request_payload,resource.id,lower(p_extension),p_original_name,p_mime_type,p_size_bytes,auth.uid()) returning * into file_row;
  return jsonb_build_object('id',file_row.id,'bucket_id',file_row.bucket_id,'object_path',file_row.object_path,'original_name',file_row.original_name,
    'mime_type',file_row.mime_type,'size_bytes',file_row.size_bytes,'ready',file_row.ready,'active',file_row.active);
end;
$$;

create function public.finalize_teacher_learning_file(p_file_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,storage,pg_temp as $$
declare file_row public.learning_resource_files; resource public.learning_resources; object_row storage.objects;
begin
  select * into file_row from public.learning_resource_files where id=p_file_id;
  if not found or file_row.uploaded_by<>auth.uid() or not public.can_manage_learning_resource(file_row.resource_id) then raise exception 'File access denied' using errcode='42501'; end if;
  select * into resource from public.learning_resources where id=file_row.resource_id for update;
  if resource.state<>'draft' then raise exception 'Only a draft resource can receive file changes'; end if;
  if not exists(select 1 from public.reporting_periods where id=resource.reporting_period_id and period_status='open' and is_current) then
    raise exception 'The resource reporting period is closed or no longer current';
  end if;
  select * into file_row from public.learning_resource_files where id=p_file_id for update;
  if file_row.ready then return jsonb_build_object('id',file_row.id,'ready',true,'active',file_row.active); end if;
  select * into object_row from storage.objects where bucket_id=file_row.bucket_id and name=file_row.object_path;
  if not found or (object_row.metadata->>'size')::bigint is distinct from file_row.size_bytes
    or object_row.metadata->>'mimetype' is distinct from file_row.mime_type then
    raise exception 'Stored file is missing or does not match the reserved size and format';
  end if;
  update public.learning_resource_files set active=false where resource_id=file_row.resource_id and active;
  update public.learning_resource_files set ready=true,active=true where id=file_row.id returning * into file_row;
  return jsonb_build_object('id',file_row.id,'ready',file_row.ready,'active',file_row.active);
end;
$$;

create function public.portal_storage_file_access(p_bucket text,p_path text,p_write boolean)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select p_bucket='learning-library' and exists(select 1 from public.learning_resource_files f
    join public.learning_resources r on r.id=f.resource_id
    join public.reporting_periods p on p.id=r.reporting_period_id
    where f.bucket_id=p_bucket and f.object_path=p_path and
      case when p_write then r.state='draft' and p.period_status='open' and p.is_current and not f.ready and not f.active
        and f.uploaded_by=auth.uid() and public.can_manage_learning_resource(f.resource_id)
      else public.can_read_teacher_learning_resource(f.resource_id) and f.ready and f.active end);
$$;

create function public.audit_teacher_learning_change()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare resource public.learning_resources; campus uuid; entity uuid; action_name text; details jsonb;
begin
  if tg_table_name='learning_resources' then
    campus:=new.campus_id; entity:=new.id;
    action_name:=case when tg_op='INSERT' then 'created' when old.state is distinct from new.state then new.state else 'updated' end;
    details:=jsonb_build_object('title',new.title,'class_level',new.class_level,'class_stream',new.class_stream,'subject',new.subject,'academic_year',new.academic_year,'academic_term',new.academic_term,'state',new.state);
  else
    select * into resource from public.learning_resources where id=coalesce(new.resource_id,old.resource_id);
    campus:=resource.campus_id; entity:=coalesce(new.resource_id,old.resource_id);
    action_name:=case when tg_op='INSERT' then 'file_reserved' when old.ready is distinct from new.ready and new.ready then 'file_finalized' when old.active and not new.active then 'file_replaced' else 'file_updated' end;
    details:=jsonb_build_object('file_id',coalesce(new.id,old.id),'original_name',coalesce(new.original_name,old.original_name),'extension',coalesce(new.extension,old.extension),'size_bytes',coalesce(new.size_bytes,old.size_bytes),'state',case when coalesce(new.ready,old.ready) then 'ready' else 'pending' end);
  end if;
  insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail)
    values(campus,auth.uid(),'learning_resource',entity,action_name,details);
  return coalesce(new,old);
end;
$$;
create trigger learning_resource_audit after insert or update on public.learning_resources for each row execute function public.audit_teacher_learning_change();
create trigger learning_resource_file_audit after insert or update on public.learning_resource_files for each row execute function public.audit_teacher_learning_change();

create policy "Teachers read own learning resources"
  on public.learning_resources for select to authenticated
  using (public.can_read_teacher_learning_resource(id));
create policy "Teachers read own learning file metadata"
  on public.learning_resource_files for select to authenticated
  using (public.can_read_teacher_learning_resource(resource_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('learning-library','learning-library',false,10485760,array[
  'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp'
])
on conflict(id) do nothing;
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id='learning-library' and name='learning-library' and public=false
      and file_size_limit=10485760
      and allowed_mime_types = array[
        'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/jpeg','image/png','image/webp'
      ]::text[]
  ) then
    raise exception 'The learning-library bucket already exists with an incompatible configuration';
  end if;
end;
$$;
-- Restrictive guards prevent an unrelated permissive Storage policy from
-- widening access to this bucket. Other buckets are unaffected.
create policy "Learning library scoped reads" on storage.objects as restrictive for select to authenticated
  using (bucket_id<>'learning-library' or public.portal_storage_file_access(bucket_id,name,false));
create policy "Teachers read authorized learning files" on storage.objects for select to authenticated
  using (bucket_id='learning-library' and public.portal_storage_file_access(bucket_id,name,false));
create policy "Learning library scoped uploads" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id<>'learning-library' or public.portal_storage_file_access(bucket_id,name,true));
create policy "Teachers upload reserved learning files" on storage.objects for insert to authenticated
  with check (bucket_id='learning-library' and public.portal_storage_file_access(bucket_id,name,true));
create policy "Learning library blocks object changes" on storage.objects as restrictive for update to authenticated
  using (bucket_id<>'learning-library') with check (bucket_id<>'learning-library');
create policy "Learning library blocks object deletion" on storage.objects as restrictive for delete to authenticated
  using (bucket_id<>'learning-library');

revoke all on function public.learning_teacher_allocation(uuid,uuid,uuid,text,text,text) from public,anon;
revoke all on function public.can_manage_learning_resource(uuid) from public,anon;
revoke all on function public.can_read_teacher_learning_resource(uuid) from public,anon;
revoke all on function public.teacher_learning_current_period(uuid) from public,anon;
revoke all on function public.create_teacher_learning_resource(uuid,text,text) from public,anon;
revoke all on function public.update_teacher_learning_resource(uuid,text,text) from public,anon;
revoke all on function public.set_teacher_learning_resource_state(uuid,text) from public,anon;
revoke all on function public.reserve_teacher_learning_file(uuid,uuid,text,text,text,bigint) from public,anon;
revoke all on function public.finalize_teacher_learning_file(uuid) from public,anon;
revoke all on function public.portal_storage_file_access(text,text,boolean) from public,anon;
revoke all on function public.audit_teacher_learning_change() from public,anon,authenticated;
grant execute on function public.teacher_learning_current_period(uuid) to authenticated;
grant execute on function public.can_manage_learning_resource(uuid) to authenticated;
grant execute on function public.can_read_teacher_learning_resource(uuid) to authenticated;
grant execute on function public.create_teacher_learning_resource(uuid,text,text) to authenticated;
grant execute on function public.update_teacher_learning_resource(uuid,text,text) to authenticated;
grant execute on function public.set_teacher_learning_resource_state(uuid,text) to authenticated;
grant execute on function public.reserve_teacher_learning_file(uuid,uuid,text,text,text,bigint) to authenticated;
grant execute on function public.finalize_teacher_learning_file(uuid) to authenticated;
grant execute on function public.portal_storage_file_access(text,text,boolean) to authenticated;
grant usage on schema storage to authenticated;
grant insert,select on storage.objects to authenticated;
notify pgrst,'reload schema';
commit;
