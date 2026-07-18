-- pg-safeupdate also validates the UPDATE branch of INSERT ... ON CONFLICT.
-- Make every intentional mirror upsert explicit without disabling protection.
do $migration$
declare
  v_definition text;
  v_upsert_count integer;
  v_guarded_upsert_count integer;
begin
  select pg_get_functiondef(
    'public.erp_refresh_relational_mirror(jsonb,timestamptz)'::regprocedure
  ) into v_definition;

  v_upsert_count :=
    (length(lower(v_definition)) - length(replace(lower(v_definition), 'do update set', '')))
    / length('do update set');

  if v_upsert_count <> 23 then
    raise exception
      'Expected 23 mirror upserts, found %. Refusing to rewrite an unexpected function.',
      v_upsert_count;
  end if;

  v_definition := regexp_replace(
    v_definition,
    '(on[[:space:]]+conflict[^\n]+do[[:space:]]+update[[:space:]]+set[^\n]+);',
    '\1 where true;',
    'gi'
  );

  v_guarded_upsert_count := regexp_count(
    lower(v_definition),
    'do[[:space:]]+update[[:space:]]+set[^\n]+where[[:space:]]+true;'
  );

  if v_guarded_upsert_count <> 23 then
    raise exception
      'Safe upsert rewrite produced % guarded statements. Refusing partial migration.',
      v_guarded_upsert_count;
  end if;

  execute v_definition;
end;
$migration$;
