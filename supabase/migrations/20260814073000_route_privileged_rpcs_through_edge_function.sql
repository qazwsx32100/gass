begin;

-- Privileged ERP RPCs must only be invoked by the verified Edge Function.
-- The Edge Function authenticates the platform JWT and the private ERP sync
-- secret, then calls these functions with its service-role client.

revoke execute on function public.erp_create_backup(text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.erp_get_app_state(text)
  from public, anon, authenticated;
revoke execute on function public.erp_get_app_state_meta(text, text, text)
  from public, anon, authenticated;
revoke execute on function public.erp_list_backups(text, integer)
  from public, anon, authenticated;
revoke execute on function public.erp_list_login_audit(text, integer)
  from public, anon, authenticated;
revoke execute on function public.erp_mark_backup_drive_result(text, uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.erp_record_login_audit(text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.erp_refresh_relational_mirror_deferred(text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.erp_restore_backup(text, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.erp_set_app_state(text, jsonb, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.erp_sync_shenglong_finance(text, jsonb)
  from public, anon, authenticated;

grant execute on function public.erp_create_backup(text, text, text, text)
  to service_role;
grant execute on function public.erp_get_app_state(text)
  to service_role;
grant execute on function public.erp_get_app_state_meta(text, text, text)
  to service_role;
grant execute on function public.erp_list_backups(text, integer)
  to service_role;
grant execute on function public.erp_list_login_audit(text, integer)
  to service_role;
grant execute on function public.erp_mark_backup_drive_result(text, uuid, text, text, text)
  to service_role;
grant execute on function public.erp_record_login_audit(text, text, text, text, text)
  to service_role;
grant execute on function public.erp_refresh_relational_mirror_deferred(text, timestamptz)
  to service_role;
grant execute on function public.erp_restore_backup(text, uuid, text, text)
  to service_role;
grant execute on function public.erp_set_app_state(text, jsonb, text, text, timestamptz)
  to service_role;
grant execute on function public.erp_sync_shenglong_finance(text, jsonb)
  to service_role;

commit;
