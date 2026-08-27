create or replace function public.erp_upsert_legacy_cylinder_movements(p_secret text,p_company_id text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n int;
begin
 if p_company_id<>'COMP001' or not exists(select 1 from public.erp_private_settings where (key='sync_secret' and value=p_secret) or (key='cylinder_history_sync_secret_hash' and value=encode(extensions.digest(convert_to(p_secret,'UTF8'),'sha256'),'hex'))) then raise exception 'unauthorized' using errcode='28000'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>1000 then raise exception 'invalid rows' using errcode='22023'; end if;
 insert into public.erp_legacy_cylinder_movements(source_system,legacy_id,company_id,occurred_on,status_code,payload,synced_at)
 select 'shenglong',(r->>'legacy_id')::bigint,p_company_id,nullif(r->>'occurred_on','')::date,r->>'status_code',r,now() from jsonb_array_elements(p_rows) r where r?'legacy_id' and coalesce(r->>'status_code','')<>''
 on conflict(source_system,legacy_id) do update set company_id=excluded.company_id,occurred_on=excluded.occurred_on,status_code=excluded.status_code,payload=excluded.payload,synced_at=excluded.synced_at;
 get diagnostics n=row_count; return jsonb_build_object('affected',n);
end$$;
revoke execute on function public.erp_upsert_legacy_cylinder_movements(text,text,jsonb) from public;
grant execute on function public.erp_upsert_legacy_cylinder_movements(text,text,jsonb) to anon,authenticated;
