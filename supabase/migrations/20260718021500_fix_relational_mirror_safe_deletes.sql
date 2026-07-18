-- Keep pg-safeupdate enabled while making the intentional mirror rebuild explicit.
-- The mirror function replaces its derived tables from the canonical app_state.
do $migration$
declare
  v_definition text;
  v_original_delete_count integer;
  v_safe_delete_count integer;
begin
  select pg_get_functiondef(
    'public.erp_refresh_relational_mirror(jsonb,timestamptz)'::regprocedure
  ) into v_definition;

  v_original_delete_count :=
    (length(v_definition) - length(replace(lower(v_definition), 'delete from public.', '')))
    / length('delete from public.');

  if v_original_delete_count <> 22 then
    raise exception
      'Expected 22 mirror DELETE statements, found %. Refusing to rewrite an unexpected function.',
      v_original_delete_count;
  end if;

  v_definition := regexp_replace(
    v_definition,
    '(delete[[:space:]]+from[[:space:]]+public[.][a-z_]+);',
    '\1 where true;',
    'gi'
  );

  v_safe_delete_count :=
    (length(lower(v_definition)) - length(replace(lower(v_definition), ' where true;', '')))
    / length(' where true;');

  if v_safe_delete_count < 22 then
    raise exception
      'Safe DELETE rewrite produced only % guarded statements. Refusing partial migration.',
      v_safe_delete_count;
  end if;

  execute v_definition;
end;
$migration$;
