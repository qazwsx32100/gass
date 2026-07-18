-- Mirror tables are emptied before they are rebuilt, so UPDATE branches are
-- redundant. Keep duplicate-key protection without invoking pg-safeupdate.
do $migration$
declare
  v_definition text;
  v_update_count integer;
  v_do_nothing_count integer;
begin
  select pg_get_functiondef(
    'public.erp_refresh_relational_mirror(jsonb,timestamptz)'::regprocedure
  ) into v_definition;

  v_update_count :=
    (length(lower(v_definition)) - length(replace(lower(v_definition), 'do update set', '')))
    / length('do update set');

  if v_update_count <> 23 then
    raise exception
      'Expected 23 mirror update branches, found %. Refusing to rewrite an unexpected function.',
      v_update_count;
  end if;

  v_definition := regexp_replace(
    v_definition,
    'on[[:space:]]+conflict[[:space:]]+[(][^)]+[)][[:space:]]+do[[:space:]]+update[[:space:]]+set[^\n]+;',
    'on conflict do nothing;',
    'gi'
  );

  v_do_nothing_count :=
    (length(lower(v_definition)) - length(replace(lower(v_definition), 'on conflict do nothing;', '')))
    / length('on conflict do nothing;');

  if v_do_nothing_count <> 23 then
    raise exception
      'Mirror rewrite produced % DO NOTHING branches. Refusing partial migration.',
      v_do_nothing_count;
  end if;

  execute v_definition;
end;
$migration$;
