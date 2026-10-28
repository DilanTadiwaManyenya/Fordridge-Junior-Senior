-- Learner accounts have a supported inactive lifecycle. Never hard-delete their
-- profile, because dependent FKs include both restrictive history and cascades.
revoke delete on table public.profiles from public, anon, authenticated;

create or replace function public.prevent_learner_profile_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'student' then
    raise exception using
      errcode = 'P0001',
      message = 'Learner profiles cannot be deleted; deactivate the learner to preserve school history';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_learner_profile_deletion() from public, anon, authenticated;

drop trigger if exists prevent_learner_profile_deletion on public.profiles;
create trigger prevent_learner_profile_deletion
before delete on public.profiles
for each row execute function public.prevent_learner_profile_deletion();
