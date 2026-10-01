UPDATE public.app_state s
SET state = jsonb_set(
  s.state,
  '{journalEntries}',
  coalesce((
    SELECT jsonb_agg(item ORDER BY ord)
    FROM jsonb_array_elements(coalesce(s.state->'journalEntries', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
    WHERE NOT (
      item->>'sourceType' = 'income'
      AND item->>'sourceId' IN ('SL-SYNC-REV-20260731-GAS', 'SL-SYNC-REV-20260831-GAS')
      AND coalesce(nullif(item->>'debit', '')::numeric, 0) = 0
      AND coalesce(nullif(item->>'credit', '')::numeric, 0) = 0
    )
  ), '[]'::jsonb),
  true
),
updated_at = now(),
updated_by = 'remove_zero_duplicate_income_journals'
WHERE s.id = 'main';

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.app_state s
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.state->'journalEntries', '[]'::jsonb)) item
    WHERE s.id = 'main'
    GROUP BY item->>'id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'journalEntries still contains duplicate ids after zero duplicate cleanup';
  END IF;
END;
$verify$;
