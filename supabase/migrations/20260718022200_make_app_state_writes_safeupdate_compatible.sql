-- Replace the remaining unqualified UPDATE paths in erp_set_app_state.
do $migration$
declare
  v_definition text;
  v_app_state_upsert text := $fragment$
  insert into public.app_state (id, state, updated_at, updated_by)
  values ('main', p_state, v_now, v_actor)
  on conflict (id) do update
    set state = excluded.state,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;$fragment$;
  v_app_state_write text := $fragment$
  update public.app_state
  set state = p_state,
      updated_at = v_now,
      updated_by = v_actor
  where id = 'main';

  if not found then
    insert into public.app_state (id, state, updated_at, updated_by)
    values ('main', p_state, v_now, v_actor);
  end if;$fragment$;
  v_cylinder_update text := $fragment$
  update public.erp_gas_cylinders
  set cylinder_status = case
        when raw->>'status' in (
          'empty', 'full', 'residual', 'maintenance', 'scrapped',
          'in_use', 'lost', 'retired'
        ) then raw->>'status'
        else 'empty'
      end,
      location_type = case
        when raw->>'locationType' in (
          'warehouse', 'vehicle', 'customer', 'filling_station', 'maintenance_vendor',
          'supplier', 'maintenance', 'lost', 'retired'
        ) then raw->>'locationType'
        else 'warehouse'
      end;$fragment$;
  v_cylinder_update_guarded text := $fragment$
  update public.erp_gas_cylinders
  set cylinder_status = case
        when raw->>'status' in (
          'empty', 'full', 'residual', 'maintenance', 'scrapped',
          'in_use', 'lost', 'retired'
        ) then raw->>'status'
        else 'empty'
      end,
      location_type = case
        when raw->>'locationType' in (
          'warehouse', 'vehicle', 'customer', 'filling_station', 'maintenance_vendor',
          'supplier', 'maintenance', 'lost', 'retired'
        ) then raw->>'locationType'
        else 'warehouse'
      end
  where true;$fragment$;
  v_bank_update text := $fragment$
  update public.erp_bank_transactions
  set source_type = raw->>'sourceType',
      source_id = raw->>'sourceId',
      transaction_type = raw->>'transactionType',
      payment_method = raw->>'paymentMethod';$fragment$;
  v_bank_update_guarded text := $fragment$
  update public.erp_bank_transactions
  set source_type = raw->>'sourceType',
      source_id = raw->>'sourceId',
      transaction_type = raw->>'transactionType',
      payment_method = raw->>'paymentMethod'
  where true;$fragment$;
begin
  select pg_get_functiondef(
    'public.erp_set_app_state(text,jsonb,text,text,timestamptz)'::regprocedure
  ) into v_definition;

  if strpos(v_definition, v_app_state_upsert) = 0
     or strpos(v_definition, v_cylinder_update) = 0
     or strpos(v_definition, v_bank_update) = 0 then
    raise exception
      'erp_set_app_state does not match the expected pre-migration definition.';
  end if;

  v_definition := replace(v_definition, v_app_state_upsert, v_app_state_write);
  v_definition := replace(v_definition, v_cylinder_update, v_cylinder_update_guarded);
  v_definition := replace(v_definition, v_bank_update, v_bank_update_guarded);

  execute v_definition;
end;
$migration$;
