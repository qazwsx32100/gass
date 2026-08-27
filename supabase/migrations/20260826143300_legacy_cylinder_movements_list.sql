create or replace function public.erp_list_legacy_cylinder_movements(p_secret text,p_company_id text,p_search text default '',p_status_code text default '',p_start_date date default null,p_end_date date default null,p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.erp_private_settings where key='sync_secret' and value=p_secret) then raise exception 'unauthorized' using errcode='28000'; end if;
 with f as(select m.* from public.erp_legacy_cylinder_movements m where company_id=p_company_id and (coalesce(p_status_code,'')='' or status_code=p_status_code) and (p_start_date is null or occurred_on>=p_start_date) and (p_end_date is null or occurred_on<=p_end_date) and (coalesce(p_search,'')='' or payload::text ilike '%'||left(p_search,80)||'%')),
 p as(select f.*,count(*) over() total_count from f order by occurred_on desc nulls last,legacy_id desc offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,100),1),100))
 select jsonb_build_object('items',coalesce(jsonb_agg(payload||jsonb_build_object('sourceSystem',source_system,'legacyId',legacy_id)),'[]'::jsonb),'total',coalesce(max(total_count),0)) into result from p;
 return result;
end$$;
revoke execute on function public.erp_list_legacy_cylinder_movements(text,text,text,text,date,date,integer,integer) from public;
grant execute on function public.erp_list_legacy_cylinder_movements(text,text,text,text,date,date,integer,integer) to anon,authenticated;
