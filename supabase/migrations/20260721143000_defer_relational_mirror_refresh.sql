-- Keep user-facing writes short. The relational mirror is refreshed by a
-- background Vercel task after app_state and immutable audit rows commit.
create or replace function public.erp_set_app_state(
  p_secret text,
  p_state jsonb,
  p_updated_by text default 'system',
  p_request_ip text default null,
  p_expected_updated_at timestamptz default null
)
returns table(ok boolean, updated_at timestamptz, updated_by text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor text := left(coalesce(nullif(p_updated_by, ''), 'system'), 80);
  v_previous_state jsonb;
  v_current_updated_at timestamptz;
  v_previous_hash text;
  v_new_hash text;
begin
  if not exists (
    select 1 from public.erp_private_settings
    where key = 'sync_secret' and value = p_secret
  ) then
    raise exception 'invalid sync secret' using errcode = '28000';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid app state payload' using errcode = '22023';
  end if;

  if not pg_try_advisory_xact_lock(hashtext('erp_app_state_main')) then
    raise exception 'state conflict: another write is in progress'
      using errcode = '40001';
  end if;

  select state, app_state.updated_at
    into v_previous_state, v_current_updated_at
  from public.app_state
  where id = 'main'
  for update;

  v_previous_hash := case
    when v_previous_state is null then null
    else encode(digest(convert_to(v_previous_state::text, 'UTF8'), 'sha256'), 'hex')
  end;
  v_new_hash := encode(digest(convert_to(p_state::text, 'UTF8'), 'sha256'), 'hex');

  -- A repeated save from another tab is already complete and needs no audit row.
  if v_previous_hash is not distinct from v_new_hash then
    return query select true, v_current_updated_at, v_actor;
    return;
  end if;

  if p_expected_updated_at is not null
     and v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'state conflict: expected %, current %', p_expected_updated_at, v_current_updated_at
      using errcode = '40001';
  end if;

  update public.app_state
  set state = p_state,
      updated_at = v_now,
      updated_by = v_actor
  where id = 'main';

  if not found then
    insert into public.app_state (id, state, updated_at, updated_by)
    values ('main', p_state, v_now, v_actor);
  end if;

  insert into public.erp_security_events (
    event_type,
    actor,
    request_ip,
    previous_state_hash,
    new_state_hash,
    payload,
    purge_after
  ) values (
    'APP_STATE_SAVE',
    v_actor,
    nullif(p_request_ip, ''),
    v_previous_hash,
    v_new_hash,
    jsonb_build_object('app_state_id', 'main'),
    v_now + interval '1 year'
  );

  perform public.erp_append_immutable_event(
    'APP_STATE_SAVE',
    'app_state',
    'main',
    v_actor,
    p_request_ip,
    jsonb_build_object(
      'previous_state_hash', v_previous_hash,
      'new_state_hash', v_new_hash,
      'updated_by', v_actor
    ),
    v_now + interval '1 year'
  );

  return query select true, v_now, v_actor;
end;
$$;

create or replace function public.erp_refresh_relational_mirror_deferred(
  p_secret text,
  p_expected_updated_at timestamptz
)
returns table(refreshed boolean, skipped boolean)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set statement_timeout = '45s'
as $$
declare
  v_state jsonb;
  v_current_updated_at timestamptz;
  v_actor text;
  item jsonb;
begin
  if not exists (
    select 1 from public.erp_private_settings
    where key = 'sync_secret' and value = p_secret
  ) then
    raise exception 'invalid sync secret' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext('erp_relational_mirror_refresh'));

  select state, updated_at, updated_by
    into v_state, v_current_updated_at, v_actor
  from public.app_state
  where id = 'main';

  -- A newer write has its own queued refresh. Do not overwrite it with stale data.
  if v_state is null or v_current_updated_at is distinct from p_expected_updated_at then
    return query select false, true;
    return;
  end if;

  perform public.erp_refresh_relational_mirror(v_state, v_current_updated_at);

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
  where true;

  update public.erp_bank_transactions
  set source_type = raw->>'sourceType',
      source_id = raw->>'sourceId',
      transaction_type = raw->>'transactionType',
      payment_method = raw->>'paymentMethod'
  where true;

  for item in
    select value
    from jsonb_array_elements(coalesce(v_state->'gasCylinderMovements', '[]'::jsonb))
  loop
    insert into public.erp_gas_cylinder_movement_ledger (
      movement_id,
      company_id,
      cylinder_id,
      movement_date,
      movement_type,
      actor,
      payload,
      recorded_at
    ) values (
      item->>'id',
      item->>'companyId',
      item->>'cylinderId',
      public.erp_to_date(item->>'movementDate'),
      item->>'movementType',
      coalesce(item->>'operatorName', item->>'createdByName', v_actor, 'system'),
      item,
      coalesce(public.erp_to_timestamptz(item->>'createdAt'), v_current_updated_at)
    )
    on conflict (movement_id) do nothing;
  end loop;

  return query select true, false;
end;
$$;

revoke all on function public.erp_set_app_state(text, jsonb, text, text, timestamptz)
  from public, authenticated;
grant execute on function public.erp_set_app_state(text, jsonb, text, text, timestamptz)
  to anon;

revoke all on function public.erp_refresh_relational_mirror_deferred(text, timestamptz)
  from public, authenticated;
grant execute on function public.erp_refresh_relational_mirror_deferred(text, timestamptz)
  to anon;

notify pgrst, 'reload schema';
