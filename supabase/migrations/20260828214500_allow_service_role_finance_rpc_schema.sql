-- The dedicated finance Edge Function authenticates the caller and invokes the
-- finance RPC with the service-role client. USAGE only permits name resolution;
-- individual functions still require an explicit EXECUTE grant.
grant usage on schema public to service_role;
