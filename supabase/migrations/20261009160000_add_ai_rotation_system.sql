-- ============================================================================
-- Migration: Add Unified AI Rotation & Failover System for 盛隆瓦斯
-- Supports: Google Gemini multi-accounts + OpenAI fallback
-- Synchronized across: Cloud LINE Webhook (Vercel) + Local Dev Monitor (localhost:3333)
-- ============================================================================

-- 1. AI Accounts Table
create table if not exists public.ai_accounts (
  id text primary key,
  name text not null,
  provider text not null default 'gemini', -- 'gemini' | 'openai'
  api_key text not null default '',
  enabled boolean not null default true,
  priority integer not null default 1,     -- 1: Gemini accounts, 99: OpenAI fallback
  status text not null default 'idle',     -- 'idle' | 'cooldown' | 'error'
  cooldown_until timestamptz,
  today_requests integer not null default 0,
  total_requests integer not null default 0,
  total_tokens bigint not null default 0,
  rate_limit_hits integer not null default 0,
  success_requests integer not null default 0,
  last_latency_ms integer default 0,
  last_error text,
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 2. AI Request & Failover Logs
create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  account_id text references public.ai_accounts(id) on delete set null,
  account_name text,
  provider text,
  model text,
  type text not null default 'completion', -- 'completion' | 'failover' | 'config'
  status text not null default 'success',  -- 'success' | 'warning' | 'error'
  latency_ms integer default 0,
  failover_count integer default 0,
  tokens integer default 0,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_accounts_lookup on public.ai_accounts (enabled, status, priority);
create index if not exists idx_ai_logs_created on public.ai_logs (created_at desc);

-- 3. Seed Existing Accounts (Keys can be set via Dashboard or SQL)
insert into public.ai_accounts (id, name, provider, api_key, enabled, priority)
values
  ('acc-1', 'qaz', 'gemini', '', true, 1),
  ('acc-2', '無名', 'gemini', '', true, 2),
  ('acc-3', '神燈', 'gemini', '', true, 3),
  ('acc-4', 'OpenAI (備援防線)', 'openai', '', true, 99)
on conflict (id) do nothing;

-- 4. RPC: Get Active Accounts with Cooldown Check
create or replace function public.erp_ai_get_candidates()
returns table (
  id text,
  name text,
  provider text,
  api_key text,
  enabled boolean,
  priority integer,
  status text,
  cooldown_until timestamptz,
  today_requests integer,
  total_requests integer,
  total_tokens bigint,
  rate_limit_hits integer,
  success_requests integer,
  last_latency_ms integer,
  last_used_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Auto-clear expired cooldowns
  update public.ai_accounts
  set status = 'idle', cooldown_until = null, updated_at = now()
  where status = 'cooldown' and cooldown_until is not null and cooldown_until <= now();

  return query
  select 
    a.id, a.name, a.provider, a.api_key, a.enabled, a.priority,
    a.status, a.cooldown_until, a.today_requests, a.total_requests,
    a.total_tokens, a.rate_limit_hits, a.success_requests, a.last_latency_ms, a.last_used_at
  from public.ai_accounts a
  where a.enabled = true
  order by 
    case when a.status = 'idle' then 0 else 1 end,
    a.priority asc,
    coalesce(a.cooldown_until, now()) asc;
end;
$$;

-- 5. RPC: Mark 429 Cooldown
create or replace function public.erp_ai_set_cooldown(
  p_account_id text,
  p_cooldown_seconds integer default 60,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_accounts
  set 
    status = 'cooldown',
    cooldown_until = now() + (coalesce(p_cooldown_seconds, 60) || ' seconds')::interval,
    rate_limit_hits = rate_limit_hits + 1,
    total_requests = total_requests + 1,
    last_error = p_error,
    updated_at = now()
  where id = p_account_id;

  -- Insert Failover Log
  insert into public.ai_logs (account_id, account_name, provider, type, status, detail)
  select 
    a.id, a.name, a.provider, 'failover', 'warning',
    coalesce(p_error, '觸發 429 限流，自動轉移至下一組帳號')
  from public.ai_accounts a
  where a.id = p_account_id;
end;
$$;

-- 6. RPC: Record Successful Request
create or replace function public.erp_ai_record_success(
  p_account_id text,
  p_tokens integer default 0,
  p_latency_ms integer default 0,
  p_model text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_accounts
  set 
    status = 'idle',
    today_requests = today_requests + 1,
    total_requests = total_requests + 1,
    success_requests = success_requests + 1,
    total_tokens = total_tokens + coalesce(p_tokens, 0),
    last_latency_ms = p_latency_ms,
    last_used_at = now(),
    updated_at = now()
  where id = p_account_id;

  -- Insert Success Log
  insert into public.ai_logs (account_id, account_name, provider, model, type, status, latency_ms, tokens, detail)
  select 
    a.id, a.name, a.provider, p_model, 'completion', 'success',
    p_latency_ms, coalesce(p_tokens, 0), 'AI 請求成功完成'
  from public.ai_accounts a
  where a.id = p_account_id;
end;
$$;

-- 7. Grant Permissions to anon & authenticated
grant execute on function public.erp_ai_get_candidates() to anon, authenticated, service_role;
grant execute on function public.erp_ai_set_cooldown(text, integer, text) to anon, authenticated, service_role;
grant execute on function public.erp_ai_record_success(text, integer, integer, text) to anon, authenticated, service_role;
