create or replace function public.erp_upsert_legacy_customer_cylinder_events(
  p_secret text,
  p_company_id text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_received integer := 0;
  v_affected integer := 0;
begin
  if not exists (
    select 1
    from public.erp_private_settings
    where (key = 'sync_secret' and value = p_secret)
       or (
         key = 'cylinder_history_sync_secret_hash'
         and value = encode(extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'), 'hex')
       )
  ) then
    raise exception 'invalid cylinder history sync secret' using errcode = '28000';
  end if;

  if p_company_id <> 'COMP001' then
    raise exception 'company id is not allowed' using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;

  v_received := jsonb_array_length(p_rows);
  if v_received > 1000 then
    raise exception 'batch exceeds 1000 rows' using errcode = '22023';
  end if;

  insert into public.erp_legacy_customer_cylinder_events (
    source_system, legacy_id, company_id, occurred_on, event_type,
    location_name, customer_id, customer_name, customer_phone,
    customer_address, quantity_50kg, quantity_20kg, quantity_18kg,
    quantity_16kg, quantity_10kg, quantity_new_4kg, quantity_4kg,
    amount, payment_status, payment_date, handled_by, legacy_order_id,
    legacy_style, legacy_old_data, synced_at
  )
  select
    'shenglong',
    row_data.legacy_id,
    p_company_id,
    row_data.occurred_on,
    row_data.event_type,
    nullif(row_data.location_name, ''),
    row_data.customer_id,
    nullif(row_data.customer_name, ''),
    nullif(row_data.customer_phone, ''),
    nullif(row_data.customer_address, ''),
    greatest(coalesce(row_data.quantity_50kg, 0), 0),
    greatest(coalesce(row_data.quantity_20kg, 0), 0),
    greatest(coalesce(row_data.quantity_18kg, 0), 0),
    greatest(coalesce(row_data.quantity_16kg, 0), 0),
    greatest(coalesce(row_data.quantity_10kg, 0), 0),
    greatest(coalesce(row_data.quantity_new_4kg, 0), 0),
    greatest(coalesce(row_data.quantity_4kg, 0), 0),
    greatest(coalesce(row_data.amount, 0), 0),
    nullif(row_data.payment_status, ''),
    row_data.payment_date,
    nullif(row_data.handled_by, ''),
    nullif(row_data.legacy_order_id, ''),
    nullif(row_data.legacy_style, ''),
    nullif(row_data.legacy_old_data, ''),
    now()
  from jsonb_to_recordset(p_rows) as row_data(
    legacy_id bigint,
    occurred_on date,
    event_type text,
    location_name text,
    customer_id text,
    customer_name text,
    customer_phone text,
    customer_address text,
    quantity_50kg integer,
    quantity_20kg integer,
    quantity_18kg integer,
    quantity_16kg integer,
    quantity_10kg integer,
    quantity_new_4kg integer,
    quantity_4kg integer,
    amount numeric,
    payment_status text,
    payment_date date,
    handled_by text,
    legacy_order_id text,
    legacy_style text,
    legacy_old_data text
  )
  where row_data.legacy_id is not null
    and row_data.occurred_on is not null
    and row_data.customer_id is not null
    and row_data.event_type in ('deposit', 'refund')
  on conflict (source_system, legacy_id) do update set
    company_id = excluded.company_id,
    occurred_on = excluded.occurred_on,
    event_type = excluded.event_type,
    location_name = excluded.location_name,
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    customer_phone = excluded.customer_phone,
    customer_address = excluded.customer_address,
    quantity_50kg = excluded.quantity_50kg,
    quantity_20kg = excluded.quantity_20kg,
    quantity_18kg = excluded.quantity_18kg,
    quantity_16kg = excluded.quantity_16kg,
    quantity_10kg = excluded.quantity_10kg,
    quantity_new_4kg = excluded.quantity_new_4kg,
    quantity_4kg = excluded.quantity_4kg,
    amount = excluded.amount,
    payment_status = excluded.payment_status,
    payment_date = excluded.payment_date,
    handled_by = excluded.handled_by,
    legacy_order_id = excluded.legacy_order_id,
    legacy_style = excluded.legacy_style,
    legacy_old_data = excluded.legacy_old_data,
    synced_at = excluded.synced_at;

  get diagnostics v_affected = row_count;
  return jsonb_build_object('received', v_received, 'affected', v_affected);
end;
$$;

revoke execute on function public.erp_upsert_legacy_customer_cylinder_events(text, text, jsonb)
  from public;
grant execute on function public.erp_upsert_legacy_customer_cylinder_events(text, text, jsonb)
  to anon, authenticated;
