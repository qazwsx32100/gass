create table if not exists public.erp_legacy_customer_cylinder_events (
  source_system text not null default 'shenglong',
  legacy_id bigint not null,
  company_id text not null,
  occurred_on date not null,
  event_type text not null,
  location_name text,
  customer_id text not null,
  customer_name text,
  customer_phone text,
  customer_address text,
  quantity_50kg integer not null default 0,
  quantity_20kg integer not null default 0,
  quantity_18kg integer not null default 0,
  quantity_16kg integer not null default 0,
  quantity_10kg integer not null default 0,
  quantity_new_4kg integer not null default 0,
  quantity_4kg integer not null default 0,
  amount numeric(14, 2) not null default 0,
  payment_status text,
  payment_date date,
  handled_by text,
  legacy_order_id text,
  legacy_style text,
  legacy_old_data text,
  synced_at timestamptz not null default now(),
  primary key (source_system, legacy_id),
  constraint erp_legacy_customer_cylinder_events_type_check
    check (event_type in ('deposit', 'refund')),
  constraint erp_legacy_customer_cylinder_events_quantities_check
    check (
      quantity_50kg >= 0 and quantity_20kg >= 0 and quantity_18kg >= 0 and
      quantity_16kg >= 0 and quantity_10kg >= 0 and
      quantity_new_4kg >= 0 and quantity_4kg >= 0
    ),
  constraint erp_legacy_customer_cylinder_events_amount_check
    check (amount >= 0)
);

create index if not exists erp_legacy_customer_cylinder_events_company_date_idx
  on public.erp_legacy_customer_cylinder_events
  (company_id, occurred_on desc, legacy_id desc);

create index if not exists erp_legacy_customer_cylinder_events_company_type_date_idx
  on public.erp_legacy_customer_cylinder_events
  (company_id, event_type, occurred_on desc, legacy_id desc);

create index if not exists erp_legacy_customer_cylinder_events_customer_idx
  on public.erp_legacy_customer_cylinder_events
  (company_id, customer_id, occurred_on desc);

alter table public.erp_legacy_customer_cylinder_events enable row level security;

revoke all on table public.erp_legacy_customer_cylinder_events
  from public, anon, authenticated;

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
    where key = 'sync_secret' and value = p_secret
  ) then
    raise exception 'invalid finance sync secret' using errcode = '28000';
  end if;

  if coalesce(p_company_id, '') = '' then
    raise exception 'company id is required' using errcode = '22023';
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

  return jsonb_build_object(
    'received', v_received,
    'affected', v_affected
  );
end;
$$;

create or replace function public.erp_list_legacy_customer_cylinder_events(
  p_secret text,
  p_company_id text,
  p_search text default '',
  p_event_type text default '',
  p_start_date date default null,
  p_end_date date default null,
  p_cursor_date date default null,
  p_cursor_id bigint default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  v_search text := left(trim(coalesce(p_search, '')), 80);
  v_items jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_next_date date;
  v_next_id bigint;
begin
  if not exists (
    select 1
    from public.erp_private_settings
    where key = 'sync_secret' and value = p_secret
  ) then
    raise exception 'invalid finance sync secret' using errcode = '28000';
  end if;

  with filtered as (
    select event.*
    from public.erp_legacy_customer_cylinder_events event
    where event.company_id = p_company_id
      and (coalesce(p_event_type, '') = '' or event.event_type = p_event_type)
      and (p_start_date is null or event.occurred_on >= p_start_date)
      and (p_end_date is null or event.occurred_on <= p_end_date)
      and (
        v_search = '' or
        event.customer_name ilike '%' || v_search || '%' or
        event.customer_phone ilike '%' || v_search || '%' or
        event.customer_address ilike '%' || v_search || '%' or
        event.customer_id ilike '%' || v_search || '%' or
        event.legacy_id::text = v_search
      )
  ), page_rows as (
    select filtered.*, (select count(*) from filtered) as total_count
    from filtered
    where p_cursor_date is null
      or (filtered.occurred_on, filtered.legacy_id) < (p_cursor_date, p_cursor_id)
    order by filtered.occurred_on desc, filtered.legacy_id desc
    limit v_limit
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'sourceSystem', source_system,
        'legacyId', legacy_id,
        'companyId', company_id,
        'occurredOn', occurred_on,
        'eventType', event_type,
        'locationName', location_name,
        'customerId', customer_id,
        'customerName', customer_name,
        'customerPhone', customer_phone,
        'customerAddress', customer_address,
        'quantity50kg', quantity_50kg,
        'quantity20kg', quantity_20kg,
        'quantity18kg', quantity_18kg,
        'quantity16kg', quantity_16kg,
        'quantity10kg', quantity_10kg,
        'quantityNew4kg', quantity_new_4kg,
        'quantity4kg', quantity_4kg,
        'amount', amount,
        'paymentStatus', payment_status,
        'paymentDate', payment_date,
        'handledBy', handled_by,
        'legacyOrderId', legacy_order_id,
        'legacyStyle', legacy_style,
        'legacyOldData', legacy_old_data
      ) order by occurred_on desc, legacy_id desc
    ), '[]'::jsonb),
    coalesce(max(total_count), 0),
    min(occurred_on) filter (
      where legacy_id = (
        select min(last_row.legacy_id)
        from page_rows last_row
        where last_row.occurred_on = (select min(date_row.occurred_on) from page_rows date_row)
      )
    ),
    min(legacy_id) filter (
      where occurred_on = (select min(date_row.occurred_on) from page_rows date_row)
    )
  into v_items, v_total, v_next_date, v_next_id
  from page_rows;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'nextCursor', case
      when jsonb_array_length(v_items) = v_limit then
        jsonb_build_object('date', v_next_date, 'id', v_next_id)
      else null
    end
  );
end;
$$;

revoke execute on function public.erp_upsert_legacy_customer_cylinder_events(text, text, jsonb)
  from public;
revoke execute on function public.erp_list_legacy_customer_cylinder_events(text, text, text, text, date, date, date, bigint, integer)
  from public;

grant execute on function public.erp_upsert_legacy_customer_cylinder_events(text, text, jsonb)
  to anon, authenticated;
grant execute on function public.erp_list_legacy_customer_cylinder_events(text, text, text, text, date, date, date, bigint, integer)
  to anon, authenticated;
