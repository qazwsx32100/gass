CREATE OR REPLACE FUNCTION public.erp_sync_shenglong_finance(
  p_secret text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_state jsonb;
  v_next jsonb;
  v_start_date date;
  v_replace_existing boolean;
  v_secret_hash text;
  v_current_hash text;
  v_current_bytes integer;
  v_backup_id uuid;
  v_removed_ids text[] := ARRAY[]::text[];
  v_removed_expense_ids text[] := ARRAY[]::text[];
  v_removed_bank_ids text[] := ARRAY[]::text[];
  v_removed_journal_ids text[] := ARRAY[]::text[];
  v_existing_incomes jsonb := '[]'::jsonb;
  v_existing_expenses jsonb := '[]'::jsonb;
  v_existing_customers jsonb := '[]'::jsonb;
  v_existing_bank_transactions jsonb := '[]'::jsonb;
  v_existing_gas_purchases jsonb := '[]'::jsonb;
  v_existing_entries jsonb := '[]'::jsonb;
  v_existing_lines jsonb := '[]'::jsonb;
  v_accounts jsonb := '[]'::jsonb;
  v_expense_count integer;
  v_refund_total numeric := 0;
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RAISE EXCEPTION 'invalid finance sync secret' USING ERRCODE = '28000';
  END IF;

  v_secret_hash := encode(extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'), 'hex');
  IF NOT EXISTS (
    SELECT 1 FROM public.erp_private_settings
    WHERE key = 'finance_sync_secret_hash' AND value = v_secret_hash
  ) THEN
    RAISE EXCEPTION 'invalid finance sync secret' USING ERRCODE = '28000';
  END IF;

  IF p_payload IS NULL OR p_payload->>'source' <> 'shenglong' THEN
    RAISE EXCEPTION 'invalid finance sync payload' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload->'incomes') <> 'array'
     OR jsonb_typeof(p_payload->'expenses') <> 'array'
     OR jsonb_typeof(p_payload->'customers') <> 'array'
     OR jsonb_typeof(p_payload->'journalEntries') <> 'array'
     OR jsonb_typeof(p_payload->'journalLines') <> 'array'
     OR jsonb_typeof(p_payload->'gasPurchases') <> 'array'
     OR jsonb_typeof(p_payload->'bankTransactions') <> 'array' THEN
    RAISE EXCEPTION 'finance sync arrays are required' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_payload::text) > 3500000 THEN
    RAISE EXCEPTION 'finance sync payload is too large' USING ERRCODE = '54000';
  END IF;

  v_start_date := (p_payload->>'startDate')::date;
  v_replace_existing := coalesce((p_payload->>'replaceExistingIncome')::boolean, false);

  SELECT state INTO v_state
  FROM public.app_state
  WHERE id = 'main'
  FOR UPDATE;
  IF v_state IS NULL THEN
    RAISE EXCEPTION 'app state is empty' USING ERRCODE = '22023';
  END IF;

  v_current_hash := encode(extensions.digest(convert_to(v_state::text, 'UTF8'), 'sha256'), 'hex');
  v_current_bytes := octet_length(v_state::text);
  v_refund_total := coalesce((p_payload->>'refundTotal')::numeric, 0);

  INSERT INTO public.erp_backups (
    reason, actor, state_hash, state_bytes, snapshot, purge_after
  ) VALUES (
    'before_shenglong_finance_sync', '盛隆每日財務同步',
    v_current_hash, v_current_bytes, v_state, v_now + interval '1 year'
  ) RETURNING id INTO v_backup_id;

  SELECT coalesce(array_agg(item->>'id'), ARRAY[]::text[])
  INTO v_removed_ids
  FROM jsonb_array_elements(coalesce(v_state->'incomes', '[]'::jsonb)) item
  WHERE item->>'syncSource' = 'shenglong'
     OR (
       v_replace_existing
       AND coalesce(item->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
       AND (item->>'date')::date >= v_start_date
     );

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
  INTO v_existing_incomes
  FROM jsonb_array_elements(coalesce(v_state->'incomes', '[]'::jsonb)) item
  WHERE NOT (coalesce(item->>'id', '') = ANY(v_removed_ids));

  -- 舊系統為退押金唯一來源。移除同步產生及同期間日結手動補登的
  -- 退押金，再依鋼瓶流水編號逐筆重建，確保重跑不重複且日期正確。
  SELECT coalesce(array_agg(item->>'id'), ARRAY[]::text[])
  INTO v_removed_expense_ids
  FROM jsonb_array_elements(coalesce(v_state->'expenses', '[]'::jsonb)) item
  WHERE (
       item->>'syncSource' IN ('shenglong', 'shenglong_reconciliation')
       AND (
         coalesce(item->>'syncType', '') = 'barrel_refund'
         OR coalesce(item->>'remarks', '') LIKE '%退押桶%'
         OR coalesce(item->>'remarks', '') LIKE '%退押金%'
       )
     )
     OR (
       coalesce(item->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
       AND (item->>'date')::date >= v_start_date
       AND (
         coalesce(item->>'remarks', '') LIKE '%退押桶%'
         OR coalesce(item->>'remarks', '') LIKE '%退押金%'
       )
     );

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
  INTO v_existing_expenses
  FROM jsonb_array_elements(coalesce(v_state->'expenses', '[]'::jsonb)) item
  WHERE NOT (coalesce(item->>'id', '') = ANY(v_removed_expense_ids));

  v_expense_count := jsonb_array_length(v_existing_expenses);

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
  INTO v_existing_customers
  FROM jsonb_array_elements(coalesce(v_state->'customers', '[]'::jsonb)) item
  WHERE coalesce(item->>'syncSource', '') <> 'shenglong'
    AND NOT (
      coalesce(item->>'id', '') LIKE 'GPP%'
      AND coalesce(item->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
      AND (item->>'date')::date >= v_start_date
    );

  SELECT coalesce(array_agg(item->>'id'), ARRAY[]::text[])
  INTO v_removed_bank_ids
  FROM jsonb_array_elements(coalesce(v_state->'bankTransactions', '[]'::jsonb)) item
  WHERE item->>'syncSource' = 'shenglong'
     OR (item->>'sourceType' = 'settlement'
         AND coalesce(item->>'sourceId', '') = ANY(v_removed_ids))
     OR (item->>'sourceType' = 'settlement'
         AND coalesce(item->>'sourceId', '') = ANY(v_removed_expense_ids))
     OR (v_replace_existing
         AND item->>'sourceType' = 'settlement'
         AND coalesce(item->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
         AND (item->>'date')::date >= v_start_date);

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
  INTO v_existing_bank_transactions
  FROM jsonb_array_elements(coalesce(v_state->'bankTransactions', '[]'::jsonb)) item
  WHERE NOT (coalesce(item->>'id', '') = ANY(v_removed_bank_ids));

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
  INTO v_existing_gas_purchases
  FROM jsonb_array_elements(coalesce(v_state->'gasPurchases', '[]'::jsonb)) item
  WHERE coalesce(item->>'syncSource', '') <> 'shenglong';

  SELECT coalesce(array_agg(item->>'id'), ARRAY[]::text[])
  INTO v_removed_journal_ids
  FROM jsonb_array_elements(coalesce(v_state->'journalEntries', '[]'::jsonb)) item
  WHERE (item->>'sourceType' = 'income'
         AND coalesce(item->>'sourceId', '') = ANY(v_removed_ids))
     OR (item->>'sourceType' = 'expense'
         AND coalesce(item->>'sourceId', '') = ANY(v_removed_expense_ids))
     OR (item->>'sourceType' = 'settlement'
         AND coalesce(item->>'sourceId', '') = ANY(v_removed_bank_ids));

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
  INTO v_existing_entries
  FROM jsonb_array_elements(coalesce(v_state->'journalEntries', '[]'::jsonb)) item
  WHERE NOT (coalesce(item->>'id', '') = ANY(v_removed_journal_ids));

  SELECT coalesce(jsonb_agg(item), '[]'::jsonb)
  INTO v_existing_lines
  FROM jsonb_array_elements(coalesce(v_state->'journalLines', '[]'::jsonb)) item
  WHERE NOT (coalesce(item->>'entryId', '') = ANY(v_removed_journal_ids));

  v_accounts := coalesce(v_state->'chartOfAccounts', '[]'::jsonb);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_accounts) a WHERE a->>'code' = '3900') THEN
    v_accounts := v_accounts || jsonb_build_array(jsonb_build_object(
      'code', '3900', 'name', '期初應收餘額', 'type', 'equity',
      'desc', '盛隆系統切換時的客戶應收期初餘額'
    ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_accounts) a WHERE a->>'code' = '4105') THEN
    v_accounts := v_accounts || jsonb_build_array(jsonb_build_object(
      'code', '4105', 'name', '流量表瓦斯收入', 'type', 'revenue',
      'desc', '盛隆流量表抄表計費收入'
    ));
  END IF;

  v_next := jsonb_set(v_state, '{incomes}', v_existing_incomes || (p_payload->'incomes'), true);
  v_next := jsonb_set(v_next, '{expenses}', v_existing_expenses || (p_payload->'expenses'), true);
  v_next := jsonb_set(v_next, '{customers}', v_existing_customers || (p_payload->'customers'), true);
  v_next := jsonb_set(v_next, '{bankTransactions}', v_existing_bank_transactions || (p_payload->'bankTransactions'), true);
  v_next := jsonb_set(v_next, '{gasPurchases}', v_existing_gas_purchases || (p_payload->'gasPurchases'), true);
  v_next := jsonb_set(v_next, '{journalEntries}', v_existing_entries || (p_payload->'journalEntries'), true);
  v_next := jsonb_set(v_next, '{journalLines}', v_existing_lines || (p_payload->'journalLines'), true);
  v_next := jsonb_set(v_next, '{chartOfAccounts}', v_accounts, true);
  v_next := jsonb_set(v_next, '{shenglongFinanceSync}', jsonb_build_object(
    'source', 'shenglong',
    'startDate', p_payload->>'startDate',
    'businessDate', p_payload->>'businessDate',
    'generatedAt', p_payload->>'generatedAt',
    'syncedAt', v_now,
    'incomeRows', jsonb_array_length(p_payload->'incomes'),
    'refundExpenseRows', jsonb_array_length(p_payload->'expenses'),
    'refundTotal', v_refund_total,
    'customerRows', jsonb_array_length(p_payload->'customers'),
    'gasPurchaseRows', jsonb_array_length(p_payload->'gasPurchases'),
    'bankTransactionRows', jsonb_array_length(p_payload->'bankTransactions'),
    'revenueTotal', coalesce((p_payload->>'revenueTotal')::numeric, 0),
    'receivablesTotal', coalesce((p_payload->>'receivablesTotal')::numeric, 0),
    'lastBackupId', v_backup_id
  ), true);

  IF jsonb_array_length(coalesce(v_next->'expenses', '[]'::jsonb))
       <> v_expense_count + jsonb_array_length(p_payload->'expenses') THEN
    RAISE EXCEPTION 'expense rows do not match finance sync payload' USING ERRCODE = '23000';
  END IF;

  UPDATE public.app_state
  SET state = v_next, updated_at = v_now, updated_by = '盛隆每日財務同步'
  WHERE id = 'main';

  PERFORM public.erp_refresh_relational_mirror(v_next, v_now);

  INSERT INTO public.erp_security_events (
    event_type, actor, previous_state_hash, new_state_hash, payload, purge_after
  ) VALUES (
    'SHENGLONG_FINANCE_SYNC', '盛隆每日財務同步', v_current_hash,
    encode(extensions.digest(convert_to(v_next::text, 'UTF8'), 'sha256'), 'hex'),
    jsonb_build_object(
      'backup_id', v_backup_id,
      'income_rows', jsonb_array_length(p_payload->'incomes'),
      'refund_expense_rows', jsonb_array_length(p_payload->'expenses'),
      'refund_total', v_refund_total,
      'customer_rows', jsonb_array_length(p_payload->'customers'),
      'gas_purchase_rows', jsonb_array_length(p_payload->'gasPurchases'),
      'bank_transaction_rows', jsonb_array_length(p_payload->'bankTransactions'),
      'revenue_total', coalesce((p_payload->>'revenueTotal')::numeric, 0),
      'receivables_total', coalesce((p_payload->>'receivablesTotal')::numeric, 0),
      'expenses_preserved', v_expense_count
    ),
    v_now + interval '1 year'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'backupId', v_backup_id,
    'syncedAt', v_now,
    'businessDate', p_payload->>'businessDate',
    'incomeRows', jsonb_array_length(p_payload->'incomes'),
    'refundExpenseRows', jsonb_array_length(p_payload->'expenses'),
    'refundTotal', v_refund_total,
    'customerRows', jsonb_array_length(p_payload->'customers'),
    'gasPurchaseRows', jsonb_array_length(p_payload->'gasPurchases'),
    'bankTransactionRows', jsonb_array_length(p_payload->'bankTransactions'),
    'revenueTotal', coalesce((p_payload->>'revenueTotal')::numeric, 0),
    'receivablesTotal', coalesce((p_payload->>'receivablesTotal')::numeric, 0),
    'expenseRowsPreserved', v_expense_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.erp_sync_shenglong_finance(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_sync_shenglong_finance(text, jsonb) TO service_role;
