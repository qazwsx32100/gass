do $$
declare
  v_now timestamptz := clock_timestamp();
  v_state jsonb;
  v_compacted_state jsonb;
  v_previous_hash text;
  v_new_hash text;
  v_backup_id uuid;
begin
  select state
    into v_state
  from public.app_state
  where id = 'main'
  for update;

  if v_state is null or not jsonb_path_exists(v_state, '$.dailyBackups[*].snapshot') then
    return;
  end if;

  insert into public.erp_backups (
    created_at,
    reason,
    actor,
    state_hash,
    state_bytes,
    snapshot,
    drive_status,
    purge_after
  ) values (
    v_now,
    'pre_compact_embedded_daily_backups',
    'system migration',
    encode(extensions.digest(convert_to(v_state::text, 'UTF8'), 'sha256'), 'hex'),
    octet_length(v_state::text),
    v_state,
    'not_configured',
    v_now + interval '1 year'
  )
  returning id into v_backup_id;

  select jsonb_set(
    v_state,
    '{dailyBackups}',
    coalesce(
      jsonb_agg(
        (item - 'snapshot') ||
        jsonb_build_object('storage', coalesce(nullif(item->>'storage', ''), 'cloud_backup_table'))
        order by ordinal
      ),
      '[]'::jsonb
    )
  )
  into v_compacted_state
  from jsonb_array_elements(coalesce(v_state->'dailyBackups', '[]'::jsonb))
       with ordinality as backup(item, ordinal);

  v_previous_hash := encode(extensions.digest(convert_to(v_state::text, 'UTF8'), 'sha256'), 'hex');
  v_new_hash := encode(extensions.digest(convert_to(v_compacted_state::text, 'UTF8'), 'sha256'), 'hex');

  update public.app_state
  set state = v_compacted_state,
      updated_at = v_now,
      updated_by = 'system backup compaction'
  where id = 'main';

  insert into public.erp_security_events (
    event_type,
    actor,
    previous_state_hash,
    new_state_hash,
    payload,
    purge_after
  ) values (
    'APP_STATE_MAINTENANCE',
    'system migration',
    v_previous_hash,
    v_new_hash,
    jsonb_build_object(
      'operation', 'compact_embedded_daily_backups',
      'backup_id', v_backup_id
    ),
    v_now + interval '1 year'
  );

  perform public.erp_append_immutable_event(
    'APP_STATE_MAINTENANCE',
    'app_state',
    'main',
    'system migration',
    null,
    jsonb_build_object(
      'operation', 'compact_embedded_daily_backups',
      'backup_id', v_backup_id,
      'previous_state_hash', v_previous_hash,
      'new_state_hash', v_new_hash
    ),
    v_now + interval '1 year'
  );
end;
$$;
