WITH normalized AS (
  SELECT
    s.id,
    coalesce((
      SELECT jsonb_agg(
        jsonb_set(
          CASE
            WHEN item->>'correctionStatus' = 'corrected'
              AND nullif(item->>'correctionType', '') IS NULL
              THEN jsonb_set(item, '{correctionType}', '"superseded"'::jsonb, true)
            WHEN coalesce(item->>'status', 'approved') = 'void'
              AND nullif(item->>'correctionStatus', '') IS NULL
              THEN jsonb_set(
                jsonb_set(item, '{correctionType}', to_jsonb(coalesce(nullif(item->>'correctionType', ''), 'void')), true),
                '{correctionStatus}', '"void"'::jsonb, true
              )
            WHEN nullif(item->>'correctionType', '') IS NOT NULL
              AND nullif(item->>'correctionStatus', '') IS NULL
              THEN jsonb_set(item, '{correctionStatus}', to_jsonb(CASE
                WHEN coalesce(item->>'status', 'approved') = 'approved' THEN 'applied'
                WHEN item->>'status' = 'void' THEN 'void'
                ELSE 'pending'
              END), true)
            ELSE item
          END,
          '{effectiveForReport}',
          to_jsonb(
            coalesce(item->>'status', 'approved') = 'approved'
            AND coalesce(item->>'correctionStatus', '') NOT IN ('corrected', 'superseded', 'void')
            AND coalesce(item->>'correctionType', '') NOT IN ('reversal', 'void')
          ),
          true
        ) ORDER BY ord
      )
      FROM jsonb_array_elements(coalesce(s.state->'incomes', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
    ), '[]'::jsonb) AS incomes,
    coalesce((
      SELECT jsonb_agg(
        jsonb_set(
          CASE
            WHEN item->>'correctionStatus' = 'corrected'
              AND nullif(item->>'correctionType', '') IS NULL
              THEN jsonb_set(item, '{correctionType}', '"superseded"'::jsonb, true)
            WHEN coalesce(item->>'status', 'approved') = 'void'
              AND nullif(item->>'correctionStatus', '') IS NULL
              THEN jsonb_set(
                jsonb_set(item, '{correctionType}', to_jsonb(coalesce(nullif(item->>'correctionType', ''), 'void')), true),
                '{correctionStatus}', '"void"'::jsonb, true
              )
            WHEN nullif(item->>'correctionType', '') IS NOT NULL
              AND nullif(item->>'correctionStatus', '') IS NULL
              THEN jsonb_set(item, '{correctionStatus}', to_jsonb(CASE
                WHEN coalesce(item->>'status', 'approved') = 'approved' THEN 'applied'
                WHEN item->>'status' = 'void' THEN 'void'
                ELSE 'pending'
              END), true)
            ELSE item
          END,
          '{effectiveForReport}',
          to_jsonb(
            coalesce(item->>'status', 'approved') = 'approved'
            AND coalesce(item->>'correctionStatus', '') NOT IN ('corrected', 'superseded', 'void')
            AND coalesce(item->>'correctionType', '') NOT IN ('reversal', 'void')
          ),
          true
        ) ORDER BY ord
      )
      FROM jsonb_array_elements(coalesce(s.state->'expenses', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
    ), '[]'::jsonb) AS expenses
  FROM public.app_state s
  WHERE s.id = 'main'
)
UPDATE public.app_state s
SET state = jsonb_set(
  jsonb_set(s.state, '{incomes}', normalized.incomes, true),
  '{expenses}', normalized.expenses, true
),
updated_at = now(),
updated_by = 'finance_report_eligibility_migration'
FROM normalized
WHERE s.id = normalized.id;
