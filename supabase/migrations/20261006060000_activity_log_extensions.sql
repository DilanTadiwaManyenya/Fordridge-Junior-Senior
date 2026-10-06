create or replace function public.log_cashbook_expense() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.audit_trail(actor_id,entity_type,entity_id,action,detail) values(new.recorded_by,'cashbook_expense',new.id,'created',jsonb_build_object('amount',new.amount,'currency',new.currency,'category',new.category)); return new; end $$;
create trigger cashbook_expense_audit after insert on public.cashbook_expenses for each row execute function public.log_cashbook_expense();
create or replace function public.log_class_assignment() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.audit_trail(campus_id,actor_id,entity_type,entity_id,action,detail) values(new.campus_id,auth.uid(),'class_assignment',new.id,'created',jsonb_build_object('teacher_id',new.teacher_id,'class_level',new.class_level,'class_stream',new.class_stream)); return new; end $$;
create trigger class_assignment_audit after insert on public.teacher_class_assignments for each row execute function public.log_class_assignment();
