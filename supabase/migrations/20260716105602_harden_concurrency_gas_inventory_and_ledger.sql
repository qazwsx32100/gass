-- Prevent lost updates, align gas inventory values with the application, and
-- preserve append-only cylinder movement evidence outside the mutable mirror.

alter table public.erp_gas_cylinders
  drop constraint if exists erp_gas_cylinders_status_chk;

alter table public.erp_gas_cylinders
  add constraint erp_gas_cylinders_status_chk
  check (cylinder_status in (
    'empty', 'full', 'residual', 'maintenance', 'scrapped',
    'in_use', 'lost', 'retired'
  ));

alter table public.erp_gas_cylinders
  drop constraint if exists erp_gas_cylinders_location_type_chk;

alter table public.erp_gas_cylinders
  add constraint erp_gas_cylinders_location_type_chk
  check (location_type in (
    'warehouse', 'vehicle', 'customer', 'filling_station', 'maintenance_vendor',
    'supplier', 'maintenance', 'lost', 'retired'
  ));

create unique index if not exists erp_gas_cylinders_company_no_unique
  on public.erp_gas_cylinders (company_id, lower(cylinder_no))
  where nullif(btrim(cylinder_no), '') is not null;

create unique index if not exists erp_gas_cylinders_company_barcode_unique
  on public.erp_gas_cylinders (company_id, lower(barcode))
  where nullif(btrim(barcode), '') is not null;

create unique index if not exists erp_gas_cylinders_company_qr_unique
  on public.erp_gas_cylinders (company_id, lower(qr_code))
  where nullif(btrim(qr_code), '') is not null;

create unique index if not exists erp_delivery_vehicles_company_plate_unique
  on public.erp_delivery_vehicles (company_id, lower(plate_no))
  where nullif(btrim(plate_no), '') is not null;

create unique index if not exists erp_customer_deposits_active_cylinder_unique
  on public.erp_customer_cylinder_deposits (cylinder_id)
  where deposit_status = 'active' and nullif(btrim(cylinder_id), '') is not null;

alter table public.erp_bank_transactions
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists transaction_type text,
  add column if not exists payment_method text;

create index if not exists erp_bank_transactions_source_idx
  on public.erp_bank_transactions (source_type, source_id)
  where source_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_gas_movements_cylinder_fkey'
      and conrelid = 'public.erp_gas_cylinder_movements'::regclass
  ) then
    alter table public.erp_gas_cylinder_movements
      add constraint erp_gas_movements_cylinder_fkey
      foreign key (cylinder_id) references public.erp_gas_cylinders(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vehicle_inventory_vehicle_fkey'
      and conrelid = 'public.erp_vehicle_inventory'::regclass
  ) then
    alter table public.erp_vehicle_inventory
      add constraint erp_vehicle_inventory_vehicle_fkey
      foreign key (vehicle_id) references public.erp_delivery_vehicles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_vehicle_inventory_cylinder_fkey'
      and conrelid = 'public.erp_vehicle_inventory'::regclass
  ) then
    alter table public.erp_vehicle_inventory
      add constraint erp_vehicle_inventory_cylinder_fkey
      foreign key (cylinder_id) references public.erp_gas_cylinders(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_deposits_cylinder_fkey'
      and conrelid = 'public.erp_customer_cylinder_deposits'::regclass
  ) then
    alter table public.erp_customer_cylinder_deposits
      add constraint erp_deposits_cylinder_fkey
      foreign key (cylinder_id) references public.erp_gas_cylinders(id) on delete set null;
  end if;
end $$;

create index if not exists erp_gas_movements_cylinder_fkey_idx
  on public.erp_gas_cylinder_movements (cylinder_id);
create index if not exists erp_vehicle_inventory_vehicle_fkey_idx
  on public.erp_vehicle_inventory (vehicle_id);
create index if not exists erp_vehicle_inventory_cylinder_fkey_idx
  on public.erp_vehicle_inventory (cylinder_id);
create index if not exists erp_deposits_cylinder_fkey_idx
  on public.erp_customer_cylinder_deposits (cylinder_id);

create table if not exists public.erp_gas_cylinder_movement_ledger (
  movement_id text primary key,
  company_id text,
  cylinder_id text not null,
  movement_date date,
  movement_type text not null,
  actor text,
  payload jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

alter table public.erp_gas_cylinder_movement_ledger enable row level security;

drop policy if exists deny_public_erp_gas_cylinder_movement_ledger
  on public.erp_gas_cylinder_movement_ledger;
create policy deny_public_erp_gas_cylinder_movement_ledger
  on public.erp_gas_cylinder_movement_ledger
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.erp_gas_cylinder_movement_ledger from public, anon, authenticated;

drop trigger if exists erp_gas_cylinder_movement_ledger_immutable
  on public.erp_gas_cylinder_movement_ledger;
create trigger erp_gas_cylinder_movement_ledger_immutable
  before update or delete on public.erp_gas_cylinder_movement_ledger
  for each row execute function public.erp_reject_immutable_change();

drop function if exists public.erp_set_app_state(text, jsonb, text, text);

create function public.erp_set_app_state(
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
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_actor text := left(coalesce(nullif(p_updated_by, ''), 'system'), 80);
  v_previous_state jsonb;
  v_current_updated_at timestamptz;
  v_previous_hash text;
  v_new_hash text;
  item jsonb;
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

  perform pg_advisory_xact_lock(hashtext('erp_app_state_main'));

  select state, app_state.updated_at
    into v_previous_state, v_current_updated_at
  from public.app_state
  where id = 'main'
  for update;

  if p_expected_updated_at is not null
     and v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'state conflict: expected %, current %', p_expected_updated_at, v_current_updated_at
      using errcode = '40001';
  end if;

  v_previous_hash := case
    when v_previous_state is null then null
    else encode(digest(convert_to(v_previous_state::text, 'UTF8'), 'sha256'), 'hex')
  end;
  v_new_hash := encode(digest(convert_to(p_state::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.app_state (id, state, updated_at, updated_by)
  values ('main', p_state, v_now, v_actor)
  on conflict (id) do update
    set state = excluded.state,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  perform public.erp_refresh_relational_mirror(p_state, v_now);

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
      end;

  update public.erp_bank_transactions
  set source_type = raw->>'sourceType',
      source_id = raw->>'sourceId',
      transaction_type = raw->>'transactionType',
      payment_method = raw->>'paymentMethod';

  for item in
    select value
    from jsonb_array_elements(coalesce(p_state->'gasCylinderMovements', '[]'::jsonb))
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
      coalesce(item->>'operatorName', item->>'createdByName', v_actor),
      item,
      coalesce(public.erp_to_timestamptz(item->>'createdAt'), v_now)
    )
    on conflict (movement_id) do nothing;
  end loop;

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

revoke all on function public.erp_set_app_state(text, jsonb, text, text, timestamptz)
  from public, authenticated;
grant execute on function public.erp_set_app_state(text, jsonb, text, text, timestamptz)
  to anon;

-- Remove accidental PUBLIC inheritance on secret-gated RPC functions. The
-- Vercel backend currently calls them with the anon key plus ERP_SYNC_SECRET.
revoke all on function public.erp_create_backup(text, text, text, text) from public, authenticated;
revoke all on function public.erp_list_backups(text, integer) from public, authenticated;
revoke all on function public.erp_mark_backup_drive_result(text, uuid, text, text, text) from public, authenticated;
revoke all on function public.erp_restore_backup(text, uuid, text, text) from public, authenticated;
revoke all on function public.erp_get_app_state(text) from public, authenticated;

grant execute on function public.erp_create_backup(text, text, text, text) to anon;
grant execute on function public.erp_list_backups(text, integer) to anon;
grant execute on function public.erp_mark_backup_drive_result(text, uuid, text, text, text) to anon;
grant execute on function public.erp_restore_backup(text, uuid, text, text) to anon;
grant execute on function public.erp_get_app_state(text) to anon;

notify pgrst, 'reload schema';
