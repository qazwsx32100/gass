-- ==============================================================================
-- 盛隆瓦斯 LINE 會員與調度中心全系統補齊串接 SQL (23 個進階 RPC 與雙向佇列)
-- ==============================================================================


-- ── Migration: 20261005192500_admin_alert_test_cooldown.sql ──
-- A successful test alert must not suppress the first real incident alert.
create or replace function public.sl_evaluate_admin_alert(
  p_integrations jsonb,
  p_notification_pending integer,
  p_backup_failed integer,
  p_legacy_failed integer,
  p_legacy_conflict integer,
  p_required_failures integer default 2,
  p_cooldown_minutes integer default 360,
  p_notification_threshold integer default 5,
  p_force boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.sl_admin_alert_state%rowtype;
  v_issues text[] := array[]::text[];
  v_fingerprint text := '';
  v_unhealthy boolean := false;
  v_send boolean := false;
  v_alert_type text := '';
  v_token uuid;
  v_failures integer := 0;
  v_service text;
  v_health jsonb;
begin
  insert into public.sl_admin_alert_state(state_key) values ('system') on conflict (state_key) do nothing;
  select * into v_state from public.sl_admin_alert_state where state_key='system' for update;

  foreach v_service in array array['supabase','line','googleSheets'] loop
    v_health := coalesce(p_integrations->v_service,'{}'::jsonb);
    if coalesce((v_health->>'healthy')::boolean,false)=false then
      v_issues := array_append(v_issues,
        case v_service when 'googleSheets' then 'Google Sheets 連線異常' when 'line' then 'LINE 連線異常' else 'Supabase 連線異常' end);
    end if;
  end loop;
  if greatest(coalesce(p_notification_pending,0),0) >= greatest(coalesce(p_notification_threshold,5),1) then
    v_issues := array_append(v_issues,'LINE 通知待處理 '||greatest(coalesce(p_notification_pending,0),0)::text||' 筆');
  end if;
  if greatest(coalesce(p_backup_failed,0),0)>0 then
    v_issues := array_append(v_issues,'Google Sheets 備份失敗 '||greatest(coalesce(p_backup_failed,0),0)::text||' 筆');
  end if;
  if greatest(coalesce(p_legacy_failed,0),0)>0 then
    v_issues := array_append(v_issues,'舊系統同步失敗 '||greatest(coalesce(p_legacy_failed,0),0)::text||' 筆');
  end if;
  if greatest(coalesce(p_legacy_conflict,0),0)>0 then
    v_issues := array_append(v_issues,'舊系統同步衝突 '||greatest(coalesce(p_legacy_conflict,0),0)::text||' 筆');
  end if;

  v_unhealthy := cardinality(v_issues)>0;
  v_fingerprint := case when v_unhealthy then md5(array_to_string(v_issues,E'\n')) else '' end;
  if v_unhealthy then
    v_failures := case when v_state.last_condition='unhealthy' and v_state.last_fingerprint=v_fingerprint
      then v_state.consecutive_failures+1 else 1 end;
  end if;

  if p_force then
    v_send := true;
    v_alert_type := 'test';
  elsif v_unhealthy and v_failures>=greatest(coalesce(p_required_failures,2),1)
    and (v_state.lease_until is null or v_state.lease_until<=now())
    and (v_state.last_alert_type<>'incident' or v_state.last_fingerprint<>v_fingerprint or v_state.last_alert_at is null
      or v_state.last_alert_at<=now()-make_interval(mins=>greatest(coalesce(p_cooldown_minutes,360),10))) then
    v_send := true;
    v_alert_type := 'incident';
  elsif not v_unhealthy and v_state.last_condition='unhealthy' and v_state.last_alert_type='incident'
    and (v_state.lease_until is null or v_state.lease_until<=now()) then
    v_send := true;
    v_alert_type := 'recovery';
  end if;

  if v_send then v_token := gen_random_uuid(); end if;
  update public.sl_admin_alert_state set
    last_condition=case when v_unhealthy then 'unhealthy' else 'healthy' end,
    consecutive_failures=v_failures,
    last_fingerprint=v_fingerprint,
    lease_token=case when v_send then v_token else lease_token end,
    lease_until=case when v_send then now()+interval '2 minutes' else lease_until end,
    updated_at=now()
  where state_key='system';

  return jsonb_build_object(
    'send',v_send,'alertType',v_alert_type,'eventId',coalesce(v_token::text,''),
    'issues',to_jsonb(v_issues),'consecutiveFailures',v_failures,
    'condition',case when v_unhealthy then 'unhealthy' else 'healthy' end
  );
end;
$$;

revoke all on function public.sl_evaluate_admin_alert(jsonb,integer,integer,integer,integer,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.sl_evaluate_admin_alert(jsonb,integer,integer,integer,integer,integer,integer,integer,boolean) to service_role;



-- ── Migration: 20261006192700_legacy_order_price_address.sql ──
create or replace function public.sl_finish_legacy_order_job_priced(
  p_job_id bigint,p_attempts integer,p_succeeded boolean,p_legacy_order_id bigint,
  p_error text,p_legacy_total numeric,p_legacy_address text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_job public.sl_legacy_sync_jobs%rowtype; v_order public.sl_orders%rowtype;
begin
  select * into v_job from public.sl_legacy_sync_jobs where id=p_job_id for update;
  if v_job.id is null then return jsonb_build_object('error','job_not_found'); end if;
  if v_job.status<>'processing' or v_job.attempts<>p_attempts then return jsonb_build_object('error','stale_attempt'); end if;
  if p_succeeded then
    if p_legacy_order_id is null then return jsonb_build_object('error','legacy_order_id_required'); end if;
    if v_job.event_type='order_create' then
      if p_legacy_total is null or p_legacy_total<=0 or nullif(btrim(p_legacy_address),'') is null then
        return jsonb_build_object('error','legacy_price_or_address_required');
      end if;
      select * into v_order from public.sl_orders where id=v_job.order_id for update;
      if v_order.id is null or v_order.source<>'line' then return jsonb_build_object('error','line_order_required'); end if;
      if v_order.total_amount is not null and v_order.total_amount<>p_legacy_total then
        return jsonb_build_object('error','displayed_price_mismatch');
      end if;
      update public.sl_orders set gas_amount=p_legacy_total,total_amount=p_legacy_total,
        delivery_address=left(p_legacy_address,300),updated_at=now() where id=v_job.order_id;
      insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
      values ('order',v_job.order_id,'update',jsonb_build_object('legacyOrderId',p_legacy_order_id,
        'total',p_legacy_total,'address',left(p_legacy_address,300)));
    end if;
    insert into public.sl_legacy_order_links(order_id,legacy_order_id,origin,source_fingerprint,last_synced_at)
    values (v_job.order_id,p_legacy_order_id,'line','',now())
    on conflict (order_id) do update set legacy_order_id=excluded.legacy_order_id,last_synced_at=now();
    update public.sl_legacy_sync_jobs set status='synced',synced_at=now(),next_attempt_at=now(),last_error='' where id=v_job.id;
    return jsonb_build_object('status','synced','orderId',v_job.order_id,'legacyOrderId',p_legacy_order_id);
  end if;
  update public.sl_legacy_sync_jobs set status=case when attempts>=10 then 'conflict' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>least(21600,greatest(60,(power(2,least(attempts,8))::integer)*60))),
    last_error=left(coalesce(p_error,'legacy write failed'),300) where id=v_job.id;
  return jsonb_build_object('status',case when v_job.attempts>=10 then 'conflict' else 'failed' end);
end;
$$;
revoke all on function public.sl_finish_legacy_order_job_priced(bigint,integer,boolean,bigint,text,numeric,text) from public,anon,authenticated;
grant execute on function public.sl_finish_legacy_order_job_priced(bigint,integer,boolean,bigint,text,numeric,text) to service_role;


-- ── Migration: 20261007103000_admin_recipients.sql ──
-- The first administrator can securely claim the single primary recipient slot
-- with the existing admin access code and a verified LINE Login identity.
create table if not exists public.sl_admin_recipients (
  recipient_key text primary key check (recipient_key = 'primary'),
  line_user_id text not null unique,
  display_name text not null default '',
  status text not null default 'active' check (status in ('active','inactive')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sl_admin_recipients enable row level security;
revoke all on table public.sl_admin_recipients from public, anon, authenticated;
grant select, insert, update on table public.sl_admin_recipients to service_role;


-- ── Migration: 20261007113000_sync_member_canonical_address.sql ──
create or replace function public.sl_sync_member_canonical_address(
  p_line_user_id text,
  p_address text,
  p_actor text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_address_id uuid;
  v_created boolean := false;
begin
  select customer_id into v_customer_id
  from public.sl_line_members
  where line_user_id = p_line_user_id and status = 'active'
  for update;
  if v_customer_id is null then return jsonb_build_object('error','member_required'); end if;
  if nullif(trim(coalesce(p_address,'')),'') is null then return jsonb_build_object('error','address_required'); end if;

  select id into v_address_id
  from public.sl_addresses
  where customer_id = v_customer_id and status = 'active'
    and regexp_replace(address,'[[:space:]]','','g') = regexp_replace(p_address,'[[:space:]]','','g')
  order by created_at, id limit 1 for update;

  if v_address_id is null then
    insert into public.sl_addresses(customer_id,label,address,is_default,status)
    values (v_customer_id,'舊系統地址',p_address,true,'active')
    returning id into v_address_id;
    v_created := true;
  end if;

  update public.sl_addresses set is_default = (id = v_address_id)
  where customer_id = v_customer_id and status = 'active';

  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,after_data)
  values ('admin',p_actor,'canonical_address_synced','address',v_address_id::text,
    jsonb_build_object('customer_id',v_customer_id,'created',v_created));
  insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
  select 'sl_addresses',a.id::text,case when v_created then 'insert' else 'update' end,to_jsonb(a)
  from public.sl_addresses a where a.id=v_address_id;

  return jsonb_build_object('addressId',v_address_id,'created',v_created);
end;
$$;

revoke all on function public.sl_sync_member_canonical_address(text,text,text) from public,anon,authenticated;
grant execute on function public.sl_sync_member_canonical_address(text,text,text) to service_role;


-- ── Migration: 20261007130000_member_address_lookup.sql ──
-- Exact address lookup for authenticated LINE member matching.
create or replace function public.sl_lookup_customers_by_address(p_address text)
returns table(customer_id uuid, legacy_customer_id text, display_name text, contact_name text, primary_phone text, customer_type text, address text, history jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.legacy_customer_id, c.display_name, c.contact_name, c.primary_phone, c.customer_type,
    matched.address,
    coalesce((select jsonb_object_agg(h.history_key, jsonb_build_object('price',h.last_unit_price,'useCount',h.use_count))
      from public.sl_customer_product_history h where h.customer_id=c.id), '{}'::jsonb)
  from public.sl_addresses matched
  join public.sl_customers c on c.id=matched.customer_id
  where matched.status='active' and c.status='active'
    and length(public.sl_normalize_address(p_address)) >= 8
    and public.sl_normalize_address(matched.address)=public.sl_normalize_address(p_address)
  order by matched.is_default desc, c.legacy_customer_id
  limit 5;
$$;
revoke all on function public.sl_lookup_customers_by_address(text) from public, anon, authenticated;
grant execute on function public.sl_lookup_customers_by_address(text) to service_role;


-- ── Migration: 20261007143000_auto_bind_exact_member.sql ──
-- Bind an existing customer automatically only when phone and full address are
-- still an exact, unique match at commit time. All ambiguous cases stay in the
-- administrator-review flow.

create or replace function public.sl_auto_bind_exact_member(
  p_line_user_id text,
  p_line_display_name text,
  p_phone text,
  p_legacy_customer_id text,
  p_address text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_address text := public.sl_normalize_address(coalesce(p_address, ''));
  v_customer_id uuid;
  v_legacy_customer_id text;
  v_match_count integer;
  v_member public.sl_line_members%rowtype;
  v_member_existed boolean;
begin
  if nullif(trim(coalesce(p_line_user_id, '')), '') is null
     or length(v_phone) < 8 or length(v_address) < 8 then
    return jsonb_build_object('status', 'verification_required');
  end if;

  select count(distinct c.id), min(c.id::text)::uuid, min(c.legacy_customer_id)
    into v_match_count, v_customer_id, v_legacy_customer_id
  from public.sl_customer_phones cp
  join public.sl_customers c on c.id = cp.customer_id
  where cp.phone_normalized = v_phone and c.status = 'active';

  if v_match_count <> 1 then
    return jsonb_build_object('status', 'verification_required', 'reason', 'phone_not_unique');
  end if;
  if coalesce(p_legacy_customer_id, '') <> coalesce(v_legacy_customer_id, '') then
    return jsonb_build_object('status', 'verification_required', 'reason', 'customer_changed');
  end if;

  perform 1 from public.sl_customers where id = v_customer_id and status = 'active' for update;
  if not found then
    return jsonb_build_object('status', 'verification_required', 'reason', 'customer_changed');
  end if;
  if not exists (
    select 1 from public.sl_addresses a
    where a.customer_id = v_customer_id and a.status = 'active'
      and public.sl_normalize_address(a.address) = v_address
  ) then
    return jsonb_build_object('status', 'verification_required', 'reason', 'address_mismatch');
  end if;
  if exists (
    select 1 from public.sl_line_members lm
    where lm.customer_id = v_customer_id and lm.status = 'active'
      and lm.line_user_id <> p_line_user_id
  ) then
    return jsonb_build_object('status', 'verification_required', 'reason', 'customer_already_bound');
  end if;
  if exists (
    select 1 from public.sl_line_members lm
    where lm.line_user_id = p_line_user_id and lm.customer_id <> v_customer_id
      and lm.status <> 'deleted'
  ) then
    return jsonb_build_object('status', 'verification_required', 'reason', 'line_conflict');
  end if;

  select exists(
    select 1 from public.sl_line_members where line_user_id = p_line_user_id
  ) into v_member_existed;

  insert into public.sl_line_members(
    line_user_id, customer_id, line_display_name, status, last_verified_at
  ) values (
    p_line_user_id, v_customer_id, left(coalesce(p_line_display_name, ''), 60), 'active', now()
  )
  on conflict (line_user_id) do update
  set customer_id = excluded.customer_id,
      line_display_name = excluded.line_display_name,
      status = 'active',
      last_verified_at = now(),
      session_version = public.sl_line_members.session_version + 1,
      updated_at = now()
  returning * into v_member;

  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('line_user', left(p_line_user_id, 100), 'auto_bind_exact_match', 'line_member', p_line_user_id,
    jsonb_build_object('customer_id', v_customer_id, 'legacy_customer_id', v_legacy_customer_id));
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('sl_line_members', p_line_user_id, case when v_member_existed then 'update' else 'insert' end, to_jsonb(v_member));

  return jsonb_build_object('status', 'bound', 'customerId', v_legacy_customer_id);
exception
  when unique_violation then
    return jsonb_build_object('status', 'verification_required', 'reason', 'binding_conflict');
end;
$$;

revoke all on function public.sl_auto_bind_exact_member(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_auto_bind_exact_member(text,text,text,text,text) to service_role;


-- ── Migration: 20261016180000_unverified_order_inquiries.sql ──
-- A request to call the shop is not a confirmed order or a member binding.
create table if not exists public.sl_unverified_order_inquiries (
  request_id uuid primary key,
  line_user_id text not null,
  binding_request_id uuid not null references public.sl_binding_requests(id),
  details text not null check (char_length(details) between 3 and 300),
  status text not null default 'pending' check (status in ('pending', 'handled', 'rejected')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  handled_by text,
  handled_at timestamptz,
  review_note text,
  constraint sl_unverified_inquiry_identity check (char_length(line_user_id) between 2 and 100)
);

create index if not exists sl_unverified_order_inquiries_status_created
  on public.sl_unverified_order_inquiries(status, created_at desc);
create index if not exists sl_unverified_order_inquiries_line_created
  on public.sl_unverified_order_inquiries(line_user_id, created_at desc);

alter table public.sl_unverified_order_inquiries enable row level security;
revoke all on public.sl_unverified_order_inquiries from public, anon, authenticated;
grant select, insert, update on public.sl_unverified_order_inquiries to service_role;


-- ── Migration: 20261018093000_lookup_customers_by_phone_with_remarks.sql ──
-- Comprehensive phone lookup matching primary_phone, sl_customer_phones (remarks, member, manual)
-- with dual-direction 02 landline support for Taipei/New Taipei.
create or replace function public.sl_lookup_customers_by_phone(p_phone text)
returns table(customer_id uuid, legacy_customer_id text, display_name text, contact_name text, primary_phone text, customer_type text, address text, history jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  with phone_query as (
    select regexp_replace(p_phone, '[^0-9]', '', 'g') as raw_digits
  ),
  query_candidates as (
    select raw_digits as digits from phone_query where length(raw_digits) >= 8
    union
    select '02' || raw_digits from phone_query where length(raw_digits) = 8 and raw_digits ~ '^[2378]'
    union
    select substr(raw_digits, 3) from phone_query where length(raw_digits) = 10 and raw_digits ~ '^02[2378]'
  ),
  matched_customers as (
    -- 1. Match primary_phone in sl_customers
    select c.id as customer_id, 1 as priority
    from public.sl_customers c
    cross join query_candidates q
    where c.status = 'active'
      and regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = q.digits

    union

    -- 2. Match in sl_customer_phones (remarks, manual, member, primary)
    select cp.customer_id, 2 as priority
    from public.sl_customer_phones cp
    join public.sl_customers c on c.id = cp.customer_id
    cross join query_candidates q
    where c.status = 'active'
      and coalesce(cp.phone_normalized, regexp_replace(cp.phone, '[^0-9]', '', 'g')) = q.digits
  ),
  deduped_matches as (
    select customer_id, min(priority) as best_priority
    from matched_customers
    group by customer_id
  )
  select
    c.id as customer_id,
    c.legacy_customer_id,
    c.display_name,
    c.contact_name,
    c.primary_phone,
    c.customer_type,
    coalesce(
      (select a.address from public.sl_addresses a where a.customer_id = c.id and a.status = 'active' order by a.is_default desc, a.created_at asc limit 1),
      ''
    ) as address,
    coalesce(
      (select jsonb_object_agg(h.history_key, jsonb_build_object('price', h.last_unit_price, 'useCount', h.use_count))
       from public.sl_customer_product_history h where h.customer_id = c.id),
      '{}'::jsonb
    ) as history
  from deduped_matches dm
  join public.sl_customers c on c.id = dm.customer_id
  order by dm.best_priority asc, c.legacy_customer_id asc
  limit 10;
$$;

revoke all on function public.sl_lookup_customers_by_phone(text) from public, anon, authenticated;
grant execute on function public.sl_lookup_customers_by_phone(text) to service_role;


-- ── Migration: 20261018094000_hardened_active_member_gate.sql ──
-- Hardened database-level active member gate.
-- Prevents suspended, deleted, or inactive members and customers from receiving
-- private addresses, price history, customer-specific prices, or orders across
-- bootstrap, address, and order query RPCs.

create or replace function public.sl_get_line_bootstrap(p_line_user_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_as_of timestamptz := now();
  v_customer_id uuid;
  v_member_row jsonb;
  v_history jsonb := '[]'::jsonb;
  v_addresses jsonb := '[]'::jsonb;
  v_products jsonb := '[]'::jsonb;
  v_price_rules jsonb := '[]'::jsonb;
  v_pending_binding jsonb;
  v_pending_address jsonb;
begin
  if p_line_user_id is null or btrim(p_line_user_id) = '' or length(p_line_user_id) > 255 then
    raise exception 'Invalid LINE user ID';
  end if;

  select jsonb_build_object(
      'line_user_id', lm.line_user_id,
      'line_display_name', lm.line_display_name,
      'status', lm.status,
      'sl_customers', jsonb_build_object(
        'id', c.id,
        'legacy_customer_id', c.legacy_customer_id,
        'contact_name', c.contact_name,
        'primary_phone', c.primary_phone,
        'customer_type', c.customer_type,
        'status', c.status
      )
    ), c.id
    into v_member_row, v_customer_id
  from public.sl_line_members lm
  join public.sl_customers c on c.id = lm.customer_id
  where lm.line_user_id = p_line_user_id
    and lm.status = 'active'
    and c.status = 'active'
  limit 1;

  if v_customer_id is not null then
    select coalesce(jsonb_agg(to_jsonb(h) order by h.history_key), '[]'::jsonb)
      into v_history
    from (
      select history_key, last_unit_price, use_count
      from public.sl_customer_product_history
      where customer_id = v_customer_id
    ) h;

    select coalesce(jsonb_agg(to_jsonb(a) order by a.is_default desc, a.created_at, a.id), '[]'::jsonb)
      into v_addresses
    from (
      select id, label, address, is_default, created_at
      from public.sl_addresses
      where customer_id = v_customer_id and status = 'active'
    ) a;

    select to_jsonb(r) into v_pending_address
    from (
      select id, status, requested_address, request_type, created_at
      from public.sl_address_requests
      where line_user_id = p_line_user_id and status = 'pending'
      order by created_at
      limit 1
    ) r;
  else
    -- Only check pending binding if the LINE user is not an existing suspended or disabled member
    if not exists (select 1 from public.sl_line_members where line_user_id = p_line_user_id and status in ('suspended', 'deleted')) then
      select to_jsonb(r) into v_pending_binding
      from (
        select id, status, created_at
        from public.sl_binding_requests
        where line_user_id = p_line_user_id and status = 'pending'
        order by created_at
        limit 1
      ) r;
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order, p.code), '[]'::jsonb)
    into v_products
  from (
    select code, name, specification, is_active, sort_order
    from public.sl_products
    where is_active = true
  ) p;

  select coalesce(jsonb_agg(to_jsonb(pr) order by pr.effective_at desc, pr.created_at desc), '[]'::jsonb)
    into v_price_rules
  from (
    select id, product_code, scope, customer_id, price, effective_at, expires_at, created_at
    from public.sl_price_rules
    where effective_at <= v_as_of
      and (expires_at is null or expires_at > v_as_of)
      and (scope <> 'customer' or (v_customer_id is not null and customer_id = v_customer_id))
  ) pr;

  return jsonb_build_object(
    'as_of', v_as_of,
    'member_row', v_member_row,
    'history', v_history,
    'addresses', v_addresses,
    'products', v_products,
    'price_rules', v_price_rules,
    'pending_binding', v_pending_binding,
    'pending_address', v_pending_address
  );
end;
$$;

revoke all on function public.sl_get_line_bootstrap(text) from public, anon, authenticated;
grant execute on function public.sl_get_line_bootstrap(text) to service_role;

create or replace function public.sl_get_member_orders(p_customer_id uuid, p_limit integer default 20)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
    select o.id, o.address_id, o.delivery_address, o.status, o.note, o.total_amount, o.created_at, o.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object('product_code', i.product_code, 'product_name', i.product_name, 'quantity', i.quantity, 'unit_price', i.unit_price, 'subtotal', i.subtotal) order by i.created_at)
        from public.sl_order_items i where i.order_id = o.id), '[]'::jsonb) sl_order_items
    from public.sl_orders o
    join public.sl_customers c on c.id = o.customer_id
    where o.customer_id = p_customer_id and o.status <> 'creating' and c.status = 'active'
    order by o.created_at desc limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) x;
$$;

revoke all on function public.sl_get_member_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.sl_get_member_orders(uuid, integer) to service_role;

create or replace function public.sl_get_member_orders_page(
  p_customer_id uuid, p_before_created_at timestamptz default null,
  p_before_id text default null, p_limit integer default 21
) returns jsonb language sql stable set search_path to '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
  from (
    select o.id, o.address_id, o.delivery_address, o.status, o.note, o.total_amount, o.created_at, o.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object('product_code', i.product_code,
        'product_name', i.product_name, 'quantity', i.quantity, 'unit_price', i.unit_price,
        'subtotal', i.subtotal) order by i.created_at)
        from public.sl_order_items i where i.order_id = o.id), '[]'::jsonb) sl_order_items
    from public.sl_orders o
    join public.sl_customers c on c.id = o.customer_id
    where o.customer_id = p_customer_id and o.status <> 'creating' and c.status = 'active'
      and (p_before_created_at is null or (o.created_at, o.id) < (p_before_created_at, p_before_id))
    order by o.created_at desc, o.id desc
    limit greatest(1, least(coalesce(p_limit, 21), 101))
  ) x;
$$;

revoke all on function public.sl_get_member_orders_page(uuid, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.sl_get_member_orders_page(uuid, timestamptz, text, integer) to service_role;

create or replace function public.sl_get_member_addresses(p_customer_id uuid)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.is_default desc, x.created_at), '[]'::jsonb) from (
    select a.id, a.label, a.address, a.is_default, a.status, a.created_at
    from public.sl_addresses a
    join public.sl_customers c on c.id = a.customer_id
    where a.customer_id = p_customer_id and a.status = 'active' and c.status = 'active'
    order by a.is_default desc, a.created_at
  ) x;
$$;

revoke all on function public.sl_get_member_addresses(uuid) from public, anon, authenticated;
grant execute on function public.sl_get_member_addresses(uuid) to service_role;


-- ── Migration: 20261013044355_rich_menu_order_history.sql ──
alter table public.sl_line_menu_config
  add column if not exists version integer not null default 1;


-- ── Migration: 20261013081912_reconcile_line_legacy_orders.sql ──
-- A business-host edit to a linked LINE order must update the original order.
-- The old import created a second LEGACY-* row while moving the link fingerprint.
create or replace function public.sl_import_legacy_order(p_order jsonb, p_items jsonb, p_fingerprint text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_legacy_id bigint := (p_order->>'legacyOrderId')::bigint;
  v_customer public.sl_customers%rowtype;
  v_line_user_id text;
  v_order_id text := 'LEGACY-'||v_legacy_id::text;
  v_existing public.sl_legacy_order_links%rowtype;
  v_original public.sl_orders%rowtype;
  v_status text;
  v_created_at timestamptz;
  v_linked_line boolean := false;
  v_total numeric;
begin
  if v_legacy_id is null or nullif(p_order->>'legacyCustomerId','') is null then
    return jsonb_build_object('error','invalid_order');
  end if;
  select * into v_customer from public.sl_customers
    where legacy_customer_id=p_order->>'legacyCustomerId' and status='active';
  if v_customer.id is null then
    return jsonb_build_object('error','unlinked_customer','legacyCustomerId',p_order->>'legacyCustomerId');
  end if;
  select * into v_existing from public.sl_legacy_order_links
    where legacy_order_id=v_legacy_id for update;
  if v_existing.id is not null and v_existing.source_fingerprint=coalesce(p_fingerprint,'') then
    return jsonb_build_object('status','unchanged','orderId',v_existing.order_id);
  end if;
  select line_user_id into v_line_user_id from public.sl_line_members
    where customer_id=v_customer.id and status='active'
    order by last_verified_at desc nulls last limit 1;
  v_status := case p_order->>'status'
    when 'completed' then 'completed' when 'cancelled' then 'cancelled'
    when 'delivering' then 'delivering' when 'assigned' then 'assigned'
    when 'accepted' then 'accepted' else 'pending' end;
  v_created_at := coalesce(nullif(p_order->>'createdAt','')::timestamptz,now());

  if v_existing.id is not null and v_existing.origin='line' then
    select * into v_original from public.sl_orders where id=v_existing.order_id for update;
    if v_original.id is null or v_original.customer_id<>v_customer.id or v_original.source<>'line' then
      return jsonb_build_object('error','linked_line_order_mismatch');
    end if;
    if (v_original.status='cancelled') <> (v_status='cancelled') then
      return jsonb_build_object('error','linked_line_cancellation_conflict');
    end if;
    v_total := nullif(p_order->>'total','')::numeric;
    if v_total is null or v_total<=0 or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
      return jsonb_build_object('error','linked_line_amount_or_items_missing');
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_items) i
      left join public.sl_products p on p.code=i->>'code'
      where p.code is null or coalesce((i->>'quantity')::integer,0)<=0
    ) then
      return jsonb_build_object('error','linked_line_unrecognized_product');
    end if;
    v_order_id := v_existing.order_id;
    v_linked_line := true;
  elsif v_existing.id is not null and v_existing.order_id<>v_order_id then
    return jsonb_build_object('error','legacy_link_conflict');
  end if;

  if v_linked_line then
    -- The customer/address, workflow status and LINE request id remain unchanged.
    update public.sl_orders set total_amount=v_total,gas_amount=null,
      updated_at=now() where id=v_order_id;
  else
    insert into public.sl_orders(id,request_id,customer_id,line_user_id,address_id,delivery_address,status,source,note,
      gas_amount,non_gas_amount,reward_discount,total_amount,notification_status,created_at,updated_at)
    values (v_order_id,'legacy:'||v_legacy_id::text,v_customer.id,v_line_user_id,null,
      left(coalesce(p_order->>'address','舊系統訂單'),300),v_status,'legacy',left(coalesce(p_order->>'note',''),300),
      null,0,0,nullif(p_order->>'total','')::numeric,'skipped',v_created_at,now())
    on conflict (id) do update set delivery_address=excluded.delivery_address,status=excluded.status,note=excluded.note,
      total_amount=excluded.total_amount,line_user_id=excluded.line_user_id,updated_at=now();
  end if;

  delete from public.sl_order_items where order_id=v_order_id;
  insert into public.sl_order_items(order_id,product_code,product_name,quantity,unit_price,subtotal)
  select v_order_id,i->>'code',case when v_linked_line then p.name else coalesce(nullif(i->>'name',''),p.name) end,
    (i->>'quantity')::integer,
    nullif(i->>'price','')::numeric,nullif(i->>'subtotal','')::numeric
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) i
  join public.sl_products p on p.code=i->>'code'
  where coalesce((i->>'quantity')::integer,0)>0;
  if v_linked_line and not exists (select 1 from public.sl_order_items where order_id=v_order_id) then
    raise exception 'linked LINE order has no recognized product items';
  end if;

  insert into public.sl_legacy_order_links(order_id,legacy_order_id,origin,source_fingerprint,last_synced_at)
  values (v_order_id,v_legacy_id,case when v_linked_line then 'line' else 'legacy' end,coalesce(p_fingerprint,''),now())
  on conflict (legacy_order_id) do update set source_fingerprint=excluded.source_fingerprint,last_synced_at=now();
  insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
  values ('order',v_order_id,case when v_existing.id is null then 'insert' else 'update' end,
    p_order||jsonb_build_object('items',p_items));
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,after_data)
  values ('legacy_sync','business_host',case when v_linked_line then 'reconcile_line_order'
    when v_existing.id is null then 'import_legacy_order' else 'update_legacy_order' end,
    'order',v_order_id,p_order);
  return jsonb_build_object('status',case when v_linked_line then 'reconciled'
    when v_existing.id is null then 'inserted' else 'updated' end,'orderId',v_order_id);
end;
$function$;

revoke all on function public.sl_import_legacy_order(jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.sl_import_legacy_order(jsonb,jsonb,text) to service_role;


-- ── Migration: 20261013082552_review_line_order_changes_after_sync.sql ──
-- Record the old-system version when a LINE member asks for a change.
-- Approval then requires a newer business-host sync of that same linked order.
alter table public.sl_line_order_requests
  add column if not exists legacy_order_id_at_request bigint,
  add column if not exists source_fingerprint_at_request text;

create or replace function public.sl_capture_order_request_baseline()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.request_type = 'change' then
    select legacy_order_id, source_fingerprint
      into new.legacy_order_id_at_request, new.source_fingerprint_at_request
    from public.sl_legacy_order_links
    where order_id = new.order_id and origin = 'line';
  end if;
  return new;
end;
$$;
revoke all on function public.sl_capture_order_request_baseline() from public, anon, authenticated;
grant execute on function public.sl_capture_order_request_baseline() to service_role;
drop trigger if exists sl_order_request_baseline on public.sl_line_order_requests;
create trigger sl_order_request_baseline before insert on public.sl_line_order_requests
  for each row execute function public.sl_capture_order_request_baseline();

create or replace function public.sl_review_line_order_request(
  p_request_id bigint, p_decision text, p_note text, p_actor text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.sl_line_order_requests%rowtype;
  v_link public.sl_legacy_order_links%rowtype;
  v_status text;
begin
  if p_decision not in ('approved','rejected') or length(trim(coalesce(p_note,''))) < 4 then
    raise exception 'invalid order request review';
  end if;
  select * into v_request from public.sl_line_order_requests
    where id = p_request_id and status = 'pending' for update;
  if v_request.id is null then return false; end if;

  if p_decision = 'approved' and v_request.request_type = 'change' then
    select * into v_link from public.sl_legacy_order_links
      where order_id = v_request.order_id and origin = 'line';
    if v_request.legacy_order_id_at_request is null
      or nullif(v_request.source_fingerprint_at_request,'') is null
      or v_link.id is null
      or v_link.legacy_order_id <> v_request.legacy_order_id_at_request
      or coalesce(v_link.source_fingerprint,'') = v_request.source_fingerprint_at_request
      or v_link.last_synced_at < v_request.created_at then
      raise exception 'linked order has not been reconciled since this request'
        using errcode = 'PZ001';
    end if;
  elsif p_decision = 'approved' and v_request.request_type = 'cancel' then
    select status into v_status from public.sl_orders where id = v_request.order_id;
    if v_status is distinct from 'cancelled' then
      raise exception 'order has not been cancelled' using errcode = 'PZ002';
    end if;
  end if;

  update public.sl_line_order_requests
  set status = p_decision, decision_note = left(trim(p_note),200), decided_by = p_actor, decided_at = now()
  where id = p_request_id;
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id)
  values ('admin',p_actor,case when p_decision='approved' then 'order_service_completed' else 'order_service_rejected' end,
    'line_order_request',p_request_id::text);
  return true;
end;
$$;
revoke all on function public.sl_review_line_order_request(bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_review_line_order_request(bigint,text,text,text) to service_role;


-- ── Migration: 20261013083713_paged_member_order_history.sql ──
-- Cursor pagination keeps older orders reachable without returning another member's rows.
create or replace function public.sl_get_member_orders_page(
  p_customer_id uuid, p_before_created_at timestamptz default null,
  p_before_id text default null, p_limit integer default 21
) returns jsonb language sql stable set search_path to '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb)
  from (
    select o.id,o.address_id,o.delivery_address,o.status,o.note,o.total_amount,o.created_at,o.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object('product_code',i.product_code,
        'product_name',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price,
        'subtotal',i.subtotal) order by i.created_at)
        from public.sl_order_items i where i.order_id=o.id),'[]'::jsonb) sl_order_items
    from public.sl_orders o
    where o.customer_id=p_customer_id and o.status<>'creating'
      and (p_before_created_at is null or (o.created_at,o.id)<(p_before_created_at,p_before_id))
    order by o.created_at desc,o.id desc
    limit greatest(1,least(coalesce(p_limit,21),101))
  ) x;
$$;
revoke all on function public.sl_get_member_orders_page(uuid,timestamptz,text,integer) from public,anon,authenticated;
grant execute on function public.sl_get_member_orders_page(uuid,timestamptz,text,integer) to service_role;


-- ── Migration: 20261018093000_member_binding_conflict_guard.sql ──
-- Suspended prior bindings also require manual staff review.
create or replace function public.sl_verify_and_bind_member(
  p_line_user_id text,
  p_line_display_name text,
  p_phone text,
  p_legacy_customer_id text,
  p_door text,
  p_floor text
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_door text := replace(replace(regexp_replace(translate(coalesce(p_door, ''), '０１２３４５６７８９', '0123456789'), '[[:space:]]', '', 'g'), '-', '之'), '－', '之');
  v_floor text := replace(replace(regexp_replace(translate(coalesce(p_floor, ''), '０１２３４５６７８９', '0123456789'), '[[:space:]]', '', 'g'), '-', '之'), '－', '之');
  v_customer_id uuid;
  v_customer_count integer;
  v_address text;
  v_real_door text;
  v_real_floor text;
  v_failures integer;
  v_locked_at timestamptz;
  v_member public.sl_line_members%rowtype;
begin
  if nullif(trim(coalesce(p_line_user_id, '')), '') is null
     or length(p_line_user_id) > 255
     or length(v_phone) < 8 or length(v_phone) > 15
     or coalesce(p_legacy_customer_id, '') = ''
     or v_door !~ '^[0-9]{1,5}(之[0-9]{1,4})?$'
     or (v_floor <> '' and v_floor !~ '^[0-9]{1,3}(之[0-9]{1,3})?$') then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  select count(distinct matched.id), min(matched.id::text)::uuid
  into v_customer_count, v_customer_id
  from (
    select cp.customer_id as id
    from public.sl_customer_phones cp
    join public.sl_customers c on c.id = cp.customer_id
    where c.status = 'active'
      and (
        cp.phone_normalized = v_phone
        or (v_phone ~ '^[2378][0-9]{7}$' and cp.phone_normalized = '02' || v_phone)
        or (v_phone ~ '^02[2378][0-9]{7}$' and cp.phone_normalized = substr(v_phone, 3))
      )
    union
    select c.id
    from public.sl_customers c
    where c.status = 'active'
      and (
        regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = v_phone
        or (v_phone ~ '^[2378][0-9]{7}$' and regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = '02' || v_phone)
        or (v_phone ~ '^02[2378][0-9]{7}$' and regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = substr(v_phone, 3))
      )
  ) matched;
  if v_customer_count <> 1 then
    return jsonb_build_object('status', 'manual_review');
  end if;

  select id into v_customer_id
  from public.sl_customers
  where id = v_customer_id and legacy_customer_id = p_legacy_customer_id and status = 'active'
  for update;
  if v_customer_id is null then
    return jsonb_build_object('status', 'customer_changed');
  end if;
  if exists (select 1 from public.sl_line_members
             where customer_id = v_customer_id and status <> 'deleted'
               and line_user_id <> p_line_user_id)
     or exists (select 1 from public.sl_line_members
                where line_user_id = p_line_user_id and customer_id <> v_customer_id
                  and status <> 'deleted') then
    return jsonb_build_object('status', 'manual_review');
  end if;

  select address into v_address
  from public.sl_addresses
  where customer_id = v_customer_id and status = 'active'
  order by is_default desc, created_at, id
  limit 1;
  if v_address is null then
    return jsonb_build_object('status', 'manual_review');
  end if;
  v_address := replace(replace(translate(v_address, '０１２３４５６７８９', '0123456789'), '-', '之'), '－', '之');
  v_real_door := substring(v_address from '([0-9]+(之[0-9]+)?)號');
  v_real_floor := coalesce(substring(v_address from '([0-9]+(之[0-9]+)?)樓'), '');
  if v_real_door is null then
    return jsonb_build_object('status', 'manual_review');
  end if;

  insert into public.sl_member_bind_attempts(customer_id)
  values (v_customer_id) on conflict (customer_id) do nothing;
  select failed_count, locked_at into v_failures, v_locked_at
  from public.sl_member_bind_attempts
  where customer_id = v_customer_id for update;
  if v_locked_at is not null then
    return jsonb_build_object('status', 'locked');
  end if;

  if v_door <> v_real_door or v_floor <> v_real_floor then
    v_failures := least(3, v_failures + 1);
    update public.sl_member_bind_attempts
    set failed_count = v_failures,
        locked_at = case when v_failures >= 3 then now() else null end,
        updated_at = now()
    where customer_id = v_customer_id;
    insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
    values ('line_user', left(p_line_user_id, 100), 'member_address_check_failed',
      'customer', v_customer_id::text, jsonb_build_object('failures', v_failures));
    return jsonb_build_object('status', case when v_failures >= 3 then 'locked' else 'wrong_address' end,
                              'remaining', 3 - v_failures);
  end if;

  update public.sl_member_bind_attempts
  set failed_count = 0, updated_at = now() where customer_id = v_customer_id;
  insert into public.sl_line_members(
    line_user_id, customer_id, line_display_name, status, last_verified_at,
    binding_started_at, binding_phone
  ) values (
    p_line_user_id, v_customer_id, left(coalesce(p_line_display_name, ''), 60),
    'active', now(), now(), v_phone
  )
  on conflict (line_user_id) do update
  set customer_id = excluded.customer_id,
      line_display_name = excluded.line_display_name,
      status = 'active', last_verified_at = now(),
      binding_phone = excluded.binding_phone,
      session_version = public.sl_line_members.session_version + 1,
      updated_at = now()
  returning * into v_member;
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('line_user', left(p_line_user_id, 100), 'member_address_self_verified',
    'line_member', p_line_user_id, jsonb_build_object('customer_id', v_customer_id));
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('sl_line_members', p_line_user_id, 'insert', to_jsonb(v_member));
  return jsonb_build_object('status', 'bound');
exception
  when unique_violation then
    return jsonb_build_object('status', 'manual_review');
end;
$$;
revoke all on function public.sl_verify_and_bind_member(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_verify_and_bind_member(text,text,text,text,text,text) to service_role;


-- ── Migration: 20261018104500_admin_staff_transaction.sql ──
-- Apply the staff grant and audit in one database transaction.
create or replace function public.sl_set_admin_staff(
  p_actor text, p_line_user_id text, p_display_name text, p_status text
) returns jsonb language plpgsql security invoker set search_path = public as $$
begin
  if p_actor is null or btrim(p_actor) = ''
     or p_line_user_id !~ '^U[0-9a-fA-F]{32}$'
     or p_status not in ('active', 'inactive') then
    return jsonb_build_object('error', 'invalid_input');
  end if;
  insert into public.sl_admin_staff(line_user_id, display_name, status, created_by, updated_at)
  values (p_line_user_id, left(coalesce(p_display_name, ''), 60), p_status, p_actor, now())
  on conflict (line_user_id) do update
  set display_name = excluded.display_name, status = excluded.status, updated_at = now();
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id)
  values ('admin', p_actor, 'admin_staff_' || p_status, 'admin_staff', p_line_user_id);
  return jsonb_build_object('status', p_status);
end;
$$;
revoke all on function public.sl_set_admin_staff(text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_set_admin_staff(text,text,text,text) to service_role;


-- ── Migration: 20261019193000_skip_legacy_status_echo.sql ──
-- ERP-originated status events are already reflected in the legacy order.
-- Do not queue them back to the ERP as a second outbound operation.
create or replace function public.sl_queue_legacy_status_change()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_order public.sl_orders%rowtype;
begin
  if new.actor_type='legacy_sync' then return new; end if;
  select * into v_order from public.sl_orders where id=new.order_id;
  if v_order.source='line' then
    insert into public.sl_legacy_sync_jobs(direction,event_type,order_id,idempotency_key,payload)
    values ('to_legacy',case when new.to_status='cancelled' then 'order_cancel' else 'order_update' end,
      new.order_id,'line:status:'||new.order_id||':'||new.id::text,
      to_jsonb(v_order)||jsonb_build_object('statusEventId',new.id))
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

-- Resolve only already-queued echoes whose source event is explicitly legacy_sync.
update public.sl_legacy_sync_jobs j
set status='synced', synced_at=now(), next_attempt_at=now(), last_error=''
from public.sl_order_status_events e
where j.direction='to_legacy'
  and j.event_type in ('order_update','order_cancel')
  and j.status in ('pending','failed')
  and j.payload->>'statusEventId' ~ '^[0-9]+$'
  and e.id=(j.payload->>'statusEventId')::bigint
  and e.order_id=j.order_id
  and e.actor_type='legacy_sync';


-- ── Migration: 20261020121000_line_order_change_once.sql ──
-- A member's change request is consumed by exactly one explicit ERP save.
alter table public.sl_line_order_requests
  add column if not exists erp_change_event_id bigint,
  add column if not exists erp_change_saved_at timestamptz;

alter table public.sl_line_order_requests
  drop constraint if exists sl_line_order_requests_status_check;
alter table public.sl_line_order_requests
  add constraint sl_line_order_requests_status_check
  check (status in ('pending','processing','approved','rejected'));

create unique index if not exists sl_line_order_requests_erp_change_event_uidx
  on public.sl_line_order_requests(erp_change_event_id)
  where erp_change_event_id is not null;

create or replace function public.sl_claim_line_order_change(
  p_order_id text, p_legacy_order_id bigint, p_event_id bigint, p_saved_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.sl_line_order_requests%rowtype;
begin
  if p_event_id is null or p_event_id <= 0 or p_saved_at is null then
    raise exception 'invalid ERP change event';
  end if;
  if not exists (
    select 1 from public.sl_legacy_order_links
    where order_id = p_order_id and legacy_order_id = p_legacy_order_id and origin = 'line'
  ) then
    raise exception 'ERP change event is not linked to a LINE order';
  end if;

  -- A retry of the same event resumes safely. Another event cannot steal it.
  select * into v_request from public.sl_line_order_requests
  where erp_change_event_id = p_event_id and order_id = p_order_id
  for update;
  if v_request.id is not null then
    return jsonb_build_object('request_id', v_request.id,
      'already_completed', v_request.status = 'approved');
  end if;

  select * into v_request from public.sl_line_order_requests
  where order_id = p_order_id and request_type = 'change' and status = 'pending'
    and legacy_order_id_at_request = p_legacy_order_id
    and created_at <= p_saved_at
  order by created_at, id limit 1 for update skip locked;
  if v_request.id is null then return jsonb_build_object('request_id', null); end if;

  update public.sl_line_order_requests
  set status = 'processing', erp_change_event_id = p_event_id,
    erp_change_saved_at = p_saved_at
  where id = v_request.id;
  return jsonb_build_object('request_id', v_request.id, 'already_completed', false);
end;
$$;

create or replace function public.sl_finish_line_order_change(
  p_request_id bigint, p_event_id bigint
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.sl_line_order_requests
  set status = 'approved', decided_by = 'erp_save', decided_at = now(),
    decision_note = '舊 ERP 第一次成功儲存改單，已自動回傳 LINE'
  where id = p_request_id and erp_change_event_id = p_event_id and status = 'processing';
  return found;
end;
$$;

revoke all on function public.sl_claim_line_order_change(text,bigint,bigint,timestamptz) from public, anon, authenticated;
revoke all on function public.sl_finish_line_order_change(bigint,bigint) from public, anon, authenticated;
grant execute on function public.sl_claim_line_order_change(text,bigint,bigint,timestamptz) to service_role;
grant execute on function public.sl_finish_line_order_change(bigint,bigint) to service_role;


-- ── Migration: 20261021214200_admin_audit_atomic.sql ──
-- Keep credential changes and their audit rows in one database transaction.
create or replace function public.sl_set_admin_credential(
  p_actor text, p_credential_id text, p_salt text, p_code_hash text, p_reason text
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_prior_exists boolean;
  v_action text;
begin
  if p_actor is null or p_actor !~ '^U[0-9A-Fa-f]{32}$'
     or p_salt is null or p_salt !~ '^[0-9a-f]{32}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_reason is null or p_reason not in ('reset', 'migration')
     or p_credential_id is null
     or (p_credential_id <> 'primary' and p_credential_id !~ '^staff:U[0-9A-Fa-f]{32}$')
     or (p_reason = 'migration' and p_credential_id <> 'primary') then
    raise exception 'invalid admin credential change' using errcode = '22023';
  end if;

  if p_credential_id like 'staff:%' then
    perform 1 from public.sl_admin_staff
      where line_user_id = substr(p_credential_id, 7) and status = 'active'
      for update;
    if not found then raise exception 'staff member is not active' using errcode = 'P0002'; end if;
    v_action := 'admin_staff_code_reset';
  elsif p_reason = 'migration' then
    v_action := 'admin_access_code_migrated';
  else
    v_action := 'admin_access_code_reset';
  end if;

  select exists(select 1 from public.sl_admin_credentials
    where credential_id = p_credential_id) into v_prior_exists;
  insert into public.sl_admin_credentials(credential_id, salt, code_hash, algorithm, updated_at)
    values (p_credential_id, p_salt, p_code_hash, 'scrypt-n16384-r8-p1', now())
    on conflict (credential_id) do update
    set salt = excluded.salt, code_hash = excluded.code_hash,
        algorithm = excluded.algorithm, updated_at = excluded.updated_at;

  -- Never store the new code, salt, or password hash in the audit log.
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, before_data, after_data)
    values ('admin', p_actor, v_action, 'admin_credential', p_credential_id,
      jsonb_build_object('existed', v_prior_exists),
      jsonb_build_object('algorithm', 'scrypt-n16384-r8-p1'));
end;
$$;
revoke all on function public.sl_set_admin_credential(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_set_admin_credential(text,text,text,text,text) to service_role;

-- An inquiry decision and its audit row must commit or roll back together.
create or replace function public.sl_review_unverified_order_inquiry(
  p_request_id uuid, p_decision text, p_actor text, p_note text
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  v_inquiry public.sl_unverified_order_inquiries%rowtype;
begin
  if p_request_id is null or p_decision is null or p_decision not in ('handled', 'rejected')
     or p_actor is null or p_actor !~ '^U[0-9A-Fa-f]{32}$'
     or char_length(coalesce(p_note, '')) > 200 then
    raise exception 'invalid inquiry review' using errcode = '22023';
  end if;

  select * into v_inquiry from public.sl_unverified_order_inquiries
    where request_id = p_request_id and status = 'pending' for update;
  if not found then return false; end if;

  update public.sl_unverified_order_inquiries
    set status = p_decision, handled_by = p_actor,
        handled_at = now(), review_note = coalesce(p_note, '')
    where request_id = p_request_id;
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, before_data, after_data)
    values ('admin', p_actor, 'unverified_order_' || p_decision,
      'order_inquiry', p_request_id::text,
      jsonb_build_object('status', v_inquiry.status),
      jsonb_build_object('status', p_decision, 'review_note', coalesce(p_note, '')));
  return true;
end;
$$;
revoke all on function public.sl_review_unverified_order_inquiry(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_review_unverified_order_inquiry(uuid,text,text,text) to service_role;


-- ── Migration: 20261023_create_operations_kv.sql ──
create table if not exists public.sl_operations_kv (
  key text primary key check (key ~ '^[a-z0-9_]{1,80}$'),
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.sl_operations_kv enable row level security;
revoke all on table public.sl_operations_kv from public, anon, authenticated;
grant select, insert, update, delete on table public.sl_operations_kv to service_role;

create table if not exists public.sl_operations_kv_auth (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.sl_operations_kv_auth enable row level security;
revoke all on table public.sl_operations_kv_auth from public, anon, authenticated;
grant select on table public.sl_operations_kv_auth to service_role;

-- Insert or rotate the SHA-256 hash of a random access token separately.
-- Never commit the token itself to the repository.


-- ── Migration: 20261023_allow_independent_operations_kv_tokens.sql ──
alter table public.sl_operations_kv_auth
  drop constraint if exists sl_operations_kv_auth_id_check;
alter table public.sl_operations_kv_auth
  add constraint sl_operations_kv_auth_id_check
  check (id ~ '^[a-z][a-z0-9_]{1,31}$');


-- ── Migration: 20261026053100_erp_cloud_order_foundation.sql ──
-- Isolated ERP cloud order ledger. Existing LINE sl_orders and legacy SQL tables are untouched.
-- This migration creates storage only; order acceptance must remain disabled until the
-- cloud price source, authentication, and idempotent local bridge are verified.
create table if not exists public.sl_erp_cloud_orders (
  id uuid primary key,
  cloud_order_no bigint generated always as identity unique,
  request_id uuid not null unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  legacy_customer_id text not null check (length(legacy_customer_id) between 1 and 40),
  customer_snapshot jsonb not null check (jsonb_typeof(customer_snapshot) = 'object'),
  pricing_snapshot jsonb not null check (jsonb_typeof(pricing_snapshot) = 'object'),
  price_snapshot_at timestamptz not null,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  floor_fee numeric(12, 2) not null default 0 check (floor_fee >= 0),
  handling_fee numeric(12, 2) not null default 0 check (handling_fee >= 0),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  status text not null default 'accepted'
    check (status in ('accepted', 'syncing', 'linked', 'needs_review', 'conflict', 'cancelled')),
  legacy_order_id bigint unique check (legacy_order_id > 0),
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  linked_at timestamptz,
  check ((status = 'linked') = (legacy_order_id is not null))
);

create index if not exists sl_erp_cloud_orders_pending_idx
  on public.sl_erp_cloud_orders (accepted_at, id)
  where status in ('accepted', 'syncing', 'needs_review', 'conflict');
create index if not exists sl_erp_cloud_orders_customer_idx
  on public.sl_erp_cloud_orders (legacy_customer_id, accepted_at desc);

create table if not exists public.sl_erp_cloud_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.sl_erp_cloud_orders(id) on delete restrict,
  event_key uuid not null unique,
  event_type text not null check (event_type ~ '^[a-z_]{2,40}$'),
  actor text not null check (length(actor) between 1 and 100),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists sl_erp_cloud_order_events_order_idx
  on public.sl_erp_cloud_order_events (order_id, occurred_at, id);

alter table public.sl_erp_cloud_orders enable row level security;
alter table public.sl_erp_cloud_order_events enable row level security;
revoke all on public.sl_erp_cloud_orders from public, anon, authenticated;
revoke all on public.sl_erp_cloud_order_events from public, anon, authenticated;
revoke all on sequence public.sl_erp_cloud_orders_cloud_order_no_seq from public, anon, authenticated;
revoke all on sequence public.sl_erp_cloud_order_events_id_seq from public, anon, authenticated;
grant select, insert, update on public.sl_erp_cloud_orders to service_role;
grant select, insert on public.sl_erp_cloud_order_events to service_role;
grant usage, select on sequence public.sl_erp_cloud_orders_cloud_order_no_seq to service_role;
grant usage, select on sequence public.sl_erp_cloud_order_events_id_seq to service_role;


-- ── Migration: 20261026111555_erp_cloud_catalog_snapshot.sql ──
-- ERP-only catalog snapshots. Existing sl_customers, sl_price_rules and LINE orders
-- are deliberately untouched. No order API may use this until ingestion is tested.
create table if not exists public.sl_erp_catalog_batches (
  id uuid primary key,
  source_name text not null check (source_name = 'gas_station_ShengLong'),
  source_snapshot_at timestamptz not null,
  source_price_at timestamptz not null,
  source_customer_max_updated_at timestamptz,
  spec text not null check (spec in ('5', '7')),
  handling_fee_enabled boolean not null,
  expected_active_customers integer not null
    check (expected_active_customers between 1 and 100000),
  expected_sha256 text not null check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.sl_erp_catalog_customers (
  batch_id uuid not null references public.sl_erp_catalog_batches(id) on delete restrict,
  legacy_customer_id bigint not null check (legacy_customer_id > 0),
  display_name text not null check (length(display_name) between 1 and 200),
  phone text not null default '' check (length(phone) <= 80),
  address text not null default '' check (length(address) <= 500),
  customer_type text not null default '' check (length(customer_type) <= 80),
  source_updated_at timestamptz,
  pricing_lines jsonb not null
    check (jsonb_typeof(pricing_lines) = 'array'
      and jsonb_array_length(pricing_lines) between 5 and 7),
  row_sha256 text not null check (row_sha256 ~ '^[0-9a-f]{64}$'),
  primary key (batch_id, legacy_customer_id)
);

create index if not exists sl_erp_catalog_customers_phone_idx
  on public.sl_erp_catalog_customers (batch_id, phone);

create table if not exists public.sl_erp_catalog_current (
  singleton boolean primary key default true check (singleton),
  batch_id uuid not null references public.sl_erp_catalog_batches(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create index if not exists sl_erp_catalog_current_batch_idx
  on public.sl_erp_catalog_current (batch_id);

alter table public.sl_erp_catalog_batches enable row level security;
alter table public.sl_erp_catalog_customers enable row level security;
alter table public.sl_erp_catalog_current enable row level security;

revoke all on public.sl_erp_catalog_batches from public, anon, authenticated;
revoke all on public.sl_erp_catalog_customers from public, anon, authenticated;
revoke all on public.sl_erp_catalog_current from public, anon, authenticated;
grant select, insert, update on public.sl_erp_catalog_batches to service_role;
grant select, insert on public.sl_erp_catalog_customers to service_role;
grant select, insert, update on public.sl_erp_catalog_current to service_role;

-- FK key-share locking alone happens after a BEFORE trigger. Take it here so
-- publication cannot race with a last customer insert.
create function public.sl_erp_catalog_require_staging()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_published_at timestamptz;
begin
  select published_at into v_published_at
  from public.sl_erp_catalog_batches
  where id = new.batch_id
  for key share;
  if not found or v_published_at is not null then
    raise exception 'CATALOG_BATCH_NOT_STAGING';
  end if;
  return new;
end;
$$;

create trigger sl_erp_catalog_customers_staging_only
before insert on public.sl_erp_catalog_customers
for each row execute function public.sl_erp_catalog_require_staging();

revoke all on function public.sl_erp_catalog_require_staging()
  from public, anon, authenticated;
grant execute on function public.sl_erp_catalog_require_staging() to service_role;

-- A batch becomes visible through exactly one pointer update. The caller must
-- first upload all rows and supply the SHA-256 of the sorted row-hash string.
create function public.sl_erp_publish_catalog(p_batch_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch public.sl_erp_catalog_batches%rowtype;
  v_count bigint;
  v_sha256 text;
begin
  select * into v_batch
  from public.sl_erp_catalog_batches
  where id = p_batch_id
  for update;
  if not found then
    raise exception 'CATALOG_BATCH_NOT_FOUND';
  end if;

  select count(*),
         encode(extensions.digest(
           coalesce(string_agg(row_sha256, '' order by legacy_customer_id), ''),
           'sha256'), 'hex')
    into v_count, v_sha256
  from public.sl_erp_catalog_customers
  where batch_id = p_batch_id;

  if v_count <> v_batch.expected_active_customers
     or v_sha256 <> v_batch.expected_sha256 then
    raise exception 'CATALOG_COUNT_OR_CHECKSUM_MISMATCH';
  end if;

  if exists (
    select 1
    from public.sl_erp_catalog_customers c
    where c.batch_id = p_batch_id
      and (
        jsonb_array_length(c.pricing_lines) <> v_batch.spec::integer
        or (select count(distinct line->>'size')
            from jsonb_array_elements(c.pricing_lines) as item(line))
            <> v_batch.spec::integer
        or exists (
          select 1
          from jsonb_array_elements(c.pricing_lines) as item(line)
          where jsonb_typeof(line) is distinct from 'object'
            or jsonb_typeof(line->'size') is distinct from 'string'
            or not (
              (v_batch.spec = '5' and line->>'size' in
                ('50kg', '20kg', '16kg', '10kg', '4kg'))
              or (v_batch.spec = '7' and line->>'size' in
                ('50kg', '20kg', '18kg', '16kg', '10kg', '新4kg', '4kg'))
            )
            or jsonb_typeof(line->'basePrice') is distinct from 'number'
            or jsonb_typeof(line->'customerDiscount') is distinct from 'number'
            or jsonb_typeof(line->'unitPrice') is distinct from 'number'
            or jsonb_typeof(line->'handlingFee') is distinct from 'number'
            or case when jsonb_typeof(line->'basePrice') = 'number'
              then (line->>'basePrice')::numeric < 0 else true end
            or case when jsonb_typeof(line->'customerDiscount') = 'number'
              then (line->>'customerDiscount')::numeric < 0 else true end
            or case when jsonb_typeof(line->'unitPrice') = 'number'
              then (line->>'unitPrice')::numeric < 0 else true end
            or case when jsonb_typeof(line->'handlingFee') = 'number'
              then (line->>'handlingFee')::numeric < 0 else true end
        )
      )
  ) then
    raise exception 'CATALOG_PRICE_LINES_INCOMPLETE';
  end if;

  insert into public.sl_erp_catalog_current (singleton, batch_id, activated_at)
  values (true, p_batch_id, now())
  on conflict (singleton) do update
    set batch_id = excluded.batch_id,
        activated_at = excluded.activated_at;

  update public.sl_erp_catalog_batches
  set published_at = now()
  where id = p_batch_id;
end;
$$;

revoke all on function public.sl_erp_publish_catalog(uuid)
  from public, anon, authenticated;
grant execute on function public.sl_erp_publish_catalog(uuid) to service_role;


-- ── Migration: 20261107213000_create_live_snapshots_and_command_queue.sql ──
-- ==============================================================================
-- 盛隆瓦斯 Phase D：即時戰情快照中樞 (live_snapshots) 與雙向派單佇列 (command_queue)
-- 版本: 20261107213000
-- 嚴格遵守 Directive #4：雲端擴充結構完全獨立於門市舊 ERP SQL Server 黑盒子之外
-- ==============================================================================

-- 1. 即時戰情快照表 (live_snapshots)
CREATE TABLE IF NOT EXISTS public.live_snapshots (
    channel_key VARCHAR(80) PRIMARY KEY,              -- 例: ops_snapshot_main, stock_live, driver_fleet
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,       -- 聚合快照內容
    etag VARCHAR(80),                                 -- SHA-1 / SHA-256 快照指紋，供無變動比對
    source_host VARCHAR(120),                         -- 推送來源主機 (例: store-pc-sync-daemon)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_snapshots_updated_at
    ON public.live_snapshots (updated_at DESC);

-- 2. 雲端至門市雙向指令佇列 (command_queue)
CREATE TABLE IF NOT EXISTS public.command_queue (
    command_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_type VARCHAR(60) NOT NULL,                -- ASSIGN_DRIVER / MARK_DELIVERED / CANCEL_ORDER / PROMOTE_DRAFT
    order_id BIGINT,                                  -- 對應舊 ERP gas_oders.oder_id (無外鍵綁定，遵守 Directive #4)
    target_driver VARCHAR(60),                        -- 指派外勤同仁 (例: 小龍 / 稍後輸入；離職員工游柏林已除名)
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',    -- PENDING / PROCESSING / ACKED / FAILED
    issued_by VARCHAR(80) DEFAULT 'operations_web',
    ack_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_queue_status_created
    ON public.command_queue (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_command_queue_order_id
    ON public.command_queue (order_id);

-- 啟用 RLS
ALTER TABLE public.live_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'live_snapshots' AND policyname = 'allow_service_live_snapshots'
    ) THEN
        CREATE POLICY allow_service_live_snapshots
            ON public.live_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'command_queue' AND policyname = 'allow_service_command_queue'
    ) THEN
        CREATE POLICY allow_service_command_queue
            ON public.command_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 嘗試掛載至 Supabase Realtime Publication（若環境支援則自動啟用 WebSocket 推播）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.live_snapshots;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.command_queue;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;


SELECT '✅ 23 個進階串接 RPC 與雙向調度資料表已 100% 補齊成功！' AS status;
