-- Group the dynamic JSON key before looking up tuition. Existing fee records are unchanged.
create or replace function public.get_fee_breakdown(
  p_form text, p_curriculum text, p_terms_enrolled integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  items jsonb := '[]'::jsonb;
  school_fee numeric;
  is_alevel boolean := position('6' in coalesce(p_form, '')) > 0;
  is_cambridge boolean := lower(coalesce(p_curriculum, '')) = 'cambridge';
  is_science boolean := position('Sciences' in coalesce(p_form, '')) > 0 and position('Comm' in coalesce(p_form, '')) = 0;
  is_comm_sci boolean := position('Comm & Sci' in coalesce(p_form, '')) > 0;
  is_comm boolean := position('Commercials' in coalesce(p_form, '')) > 0;
begin
  select jsonb_object_agg(setting_key, setting_value) into s from public.fee_settings;
  s := coalesce(s, '{}'::jsonb);
  if not is_alevel then
    school_fee := coalesce((s->>('fee_olevel_' || case when is_cambridge then 'cambridge' else 'zimsec' end))::numeric, 0);
    items := items || jsonb_build_array(jsonb_build_object('label', 'School Fees (' || case when is_cambridge then 'Cambridge' else coalesce(p_curriculum, 'ZIMSEC') end || ')', 'amount', school_fee));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Sports Fee', 'amount', coalesce((s->>'fee_sports')::numeric, 0)));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Practical Fee', 'amount', 20));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Development Levy', 'amount', coalesce((s->>'fee_development')::numeric, 0)));
    if coalesce((s->>'fee_bus')::numeric, 0) > 0 then items := items || jsonb_build_array(jsonb_build_object('label', 'Bus Levy', 'amount', (s->>'fee_bus')::numeric)); end if;
    if p_terms_enrolled = 1 then items := items || jsonb_build_array(jsonb_build_object('label', 'Lab Levy (1st Term at School)', 'amount', 30));
    elsif p_terms_enrolled = 2 then items := items || jsonb_build_array(jsonb_build_object('label', 'Lab Levy (2nd Term at School)', 'amount', 30)); end if;
  else
    is_cambridge := is_cambridge and is_science;
    school_fee := case when is_cambridge then coalesce((s->>'fee_alevel_sci_cambridge')::numeric, 0) when is_science then coalesce((s->>'fee_alevel_sci_zimsec')::numeric, 0) when is_comm_sci then coalesce((s->>'fee_alevel_comm_sci')::numeric, 0) when is_comm then coalesce((s->>'fee_alevel_comm')::numeric, 0) else coalesce((s->>'fee_alevel_arts')::numeric, 0) end;
    items := items || jsonb_build_array(jsonb_build_object('label', 'School Fees (' || case when is_cambridge then 'Cambridge' else 'ZIMSEC' end || ')', 'amount', school_fee));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Sports Fee', 'amount', coalesce((s->>'fee_sports')::numeric, 0)));
    items := items || jsonb_build_array(jsonb_build_object('label', 'Development Levy', 'amount', coalesce((s->>'fee_development')::numeric, 0)));
    if coalesce((s->>'fee_bus')::numeric, 0) > 0 then items := items || jsonb_build_array(jsonb_build_object('label', 'Bus Levy', 'amount', (s->>'fee_bus')::numeric)); end if;
    if is_cambridge then items := items || jsonb_build_array(jsonb_build_object('label', 'Lab & Computer Science Fee', 'amount', 100));
    elsif p_terms_enrolled <> 1 and (is_science or is_comm_sci) then items := items || jsonb_build_array(jsonb_build_object('label', 'Lab & Computer Science Fee', 'amount', 50)); end if;
  end if;
  if p_terms_enrolled = 1 then
    items := items || jsonb_build_array(jsonb_build_object('label', 'Registration Fee (Once off)', 'amount', 30), jsonb_build_object('label', 'Desk Fee (Once off)', 'amount', 50), jsonb_build_object('label', 'Report Book (Once off)', 'amount', 10), jsonb_build_object('label', 'School ID (Once off)', 'amount', 5));
  end if;
  return jsonb_build_object('total', (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(items) x), 'items', items);
end $$;
