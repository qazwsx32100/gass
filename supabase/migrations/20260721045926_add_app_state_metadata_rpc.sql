-- Polling only needs the revision metadata. Returning the full JSON state every
-- 30 seconds wastes database, function, and client bandwidth as the ERP grows.
create or replace function public.erp_get_app_state_meta(
  p_secret text,
  p_user_id text,
  p_device_id text
)
returns table(
  updated_at timestamptz,
  updated_by text,
  has_state boolean,
  session_allowed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.erp_private_settings
    where key = 'sync_secret' and value = p_secret
  ) then
    raise exception 'invalid sync secret' using errcode = '28000';
  end if;

  return query
  select
    state_row.updated_at,
    state_row.updated_by,
    state_row.state is not null,
    case
      when p_user_id = 'ADMIN' then
        lower(coalesce(state_row.state #>> '{adminSecurity,disabled}', 'false')) <> 'true'
        and exists (
          select 1
          from jsonb_array_elements(coalesce(state_row.state #> '{adminSecurity,approvedDevices}', '[]'::jsonb)) as device
          where device->>'id' = p_device_id
        )
      else exists (
        select 1
        from jsonb_array_elements(coalesce(state_row.state->'shareholders', '[]'::jsonb)) as account
        where account->>'id' = p_user_id
          and lower(coalesce(account->>'disabled', 'false')) <> 'true'
          and exists (
            select 1
            from jsonb_array_elements(coalesce(account->'approvedDevices', '[]'::jsonb)) as device
            where device->>'id' = p_device_id
          )
      )
    end
  from public.app_state as state_row
  where state_row.id = 'main';
end;
$$;

revoke all on function public.erp_get_app_state_meta(text, text, text)
  from public, authenticated;
grant execute on function public.erp_get_app_state_meta(text, text, text)
  to anon;

notify pgrst, 'reload schema';
