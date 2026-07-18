-- Add empty cylinder columns to erp_gas_purchases
alter table public.erp_gas_purchases add column if not exists empty_50kg integer not null default 0;
alter table public.erp_gas_purchases add column if not exists empty_20kg integer not null default 0;
alter table public.erp_gas_purchases add column if not exists empty_16kg integer not null default 0;
alter table public.erp_gas_purchases add column if not exists empty_10kg integer not null default 0;
alter table public.erp_gas_purchases add column if not exists empty_4kg integer not null default 0;

-- Re-define erp_refresh_relational_mirror to support empty_50kg, empty_20kg, empty_16kg, empty_10kg, empty_4kg columns
create or replace function public.erp_refresh_relational_mirror(p_state jsonb, p_synced_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
begin
  delete from public.erp_companies where true;
  delete from public.erp_shareholders where true;
  delete from public.erp_transactions where true;
  delete from public.erp_banks where true;
  delete from public.erp_chart_of_accounts where true;
  delete from public.erp_shareholder_ledger where true;
  delete from public.erp_loans where true;
  delete from public.erp_bank_transactions where true;
  delete from public.erp_bank_reconciliations where true;
  delete from public.erp_fixed_assets where true;
  delete from public.erp_customers where true;
  delete from public.erp_suppliers where true;
  delete from public.erp_operation_logs where true;
  delete from public.erp_audit_archive where true;
  delete from public.erp_journal_entries where true;
  delete from public.erp_journal_lines where true;
  delete from public.erp_gas_inventory_periods where true;
  delete from public.erp_delivery_vehicles where true;
  delete from public.erp_gas_cylinders where true;
  delete from public.erp_gas_cylinder_movements where true;
  delete from public.erp_vehicle_inventory where true;
  delete from public.erp_customer_cylinder_deposits where true;
  delete from public.erp_gas_purchases where true;

  for item in select value from jsonb_array_elements(coalesce(p_state->'companies', '[]'::jsonb)) loop
    insert into public.erp_companies (id, name, description, raw, synced_at)
    values (item->>'id', item->>'name', coalesce(item->>'desc', item->>'description'), item, p_synced_at)
    on conflict (id) do update set name = excluded.name, description = excluded.description, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'shareholders', '[]'::jsonb)) loop
    insert into public.erp_shareholders (id, name, email, role, disabled, raw, synced_at)
    values (item->>'id', item->>'name', item->>'email', item->>'role', public.erp_to_boolean(item->>'disabled', false), item - 'password' - 'passwordHash' - 'passwordSalt' - 'passwordAlgo', p_synced_at)
    on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role, disabled = excluded.disabled, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'banks', '[]'::jsonb)) loop
    insert into public.erp_banks (id, company_id, name, account_no, initial_balance, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'name', item->>'accountNo', public.erp_to_numeric(item->>'initialBalance'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, name = excluded.name, account_no = excluded.account_no, initial_balance = excluded.initial_balance, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'chartOfAccounts', '[]'::jsonb)) loop
    insert into public.erp_chart_of_accounts (code, name, account_type, description, raw, synced_at)
    values (item->>'code', item->>'name', item->>'type', item->>'desc', item, p_synced_at)
    on conflict (code) do update set name = excluded.name, account_type = excluded.account_type, description = excluded.description, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'incomes', '[]'::jsonb)) loop
    insert into public.erp_transactions (id, kind, company_id, transaction_date, account_code, amount, status, created_by, raw, synced_at)
    values (item->>'id', 'income', item->>'companyId', public.erp_to_date(item->>'date'), item->>'accountCode', public.erp_to_numeric(item->>'amount'), item->>'status', coalesce(item->>'createdByName', item->>'createdBy'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, transaction_date = excluded.transaction_date, account_code = excluded.account_code, amount = excluded.amount, status = excluded.status, created_by = excluded.created_by, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'expenses', '[]'::jsonb)) loop
    insert into public.erp_transactions (id, kind, company_id, transaction_date, account_code, amount, status, created_by, raw, synced_at)
    values (item->>'id', 'expense', item->>'companyId', public.erp_to_date(item->>'date'), item->>'accountCode', public.erp_to_numeric(item->>'amount'), item->>'status', coalesce(item->>'createdByName', item->>'createdBy'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, transaction_date = excluded.transaction_date, account_code = excluded.account_code, amount = excluded.amount, status = excluded.status, created_by = excluded.created_by, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'shareholderLedger', '[]'::jsonb)) loop
    insert into public.erp_shareholder_ledger (id, company_id, shareholder_id, ledger_date, movement_type, amount, remarks, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'shareholderId', public.erp_to_date(item->>'date'), item->>'type', public.erp_to_numeric(item->>'amount'), item->>'remarks', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, shareholder_id = excluded.shareholder_id, ledger_date = excluded.ledger_date, movement_type = excluded.movement_type, amount = excluded.amount, remarks = excluded.remarks, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'loans', '[]'::jsonb)) loop
    insert into public.erp_loans (id, company_id, bank_id, name, principal, interest_rate, months, start_date, monthly_payment, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'bankId', item->>'name', public.erp_to_numeric(item->>'principal'), public.erp_to_numeric(item->>'interestRate'), public.erp_to_numeric(item->>'months')::integer, public.erp_to_date(item->>'startDate'), public.erp_to_numeric(item->>'monthlyPayment'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, bank_id = excluded.bank_id, name = excluded.name, principal = excluded.principal, interest_rate = excluded.interest_rate, months = excluded.months, start_date = excluded.start_date, monthly_payment = excluded.monthly_payment, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'bankTransactions', '[]'::jsonb)) loop
    insert into public.erp_bank_transactions (id, company_id, bank_id, transaction_date, direction, amount, counterparty_name, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'bankId', public.erp_to_date(item->>'date'), item->>'direction', public.erp_to_numeric(item->>'amount'), item->>'counterpartyName', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, bank_id = excluded.bank_id, transaction_date = excluded.transaction_date, direction = excluded.direction, amount = excluded.amount, counterparty_name = excluded.counterparty_name, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'bankReconciliations', '[]'::jsonb)) loop
    insert into public.erp_bank_reconciliations (id, company_id, bank_id, statement_date, statement_balance, system_balance, difference, status, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'bankId', public.erp_to_date(item->>'statementDate'), public.erp_to_numeric(item->>'statementBalance'), public.erp_to_numeric(item->>'systemBalance'), public.erp_to_numeric(item->>'difference'), item->>'status', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, bank_id = excluded.bank_id, statement_date = excluded.statement_date, statement_balance = excluded.statement_balance, system_balance = excluded.system_balance, difference = excluded.difference, status = excluded.status, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'fixedAssets', '[]'::jsonb)) loop
    insert into public.erp_fixed_assets (id, company_id, asset_name, asset_type, acquisition_date, acquisition_cost, accumulated_depreciation, status, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'name', item->>'type', public.erp_to_date(item->>'acquisitionDate'), public.erp_to_numeric(item->>'acquisitionCost'), public.erp_to_numeric(item->>'accumulatedDepreciation'), item->>'status', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, asset_name = excluded.asset_name, asset_type = excluded.asset_type, acquisition_date = excluded.acquisition_date, acquisition_cost = excluded.acquisition_cost, accumulated_depreciation = excluded.accumulated_depreciation, status = excluded.status, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'customers', '[]'::jsonb)) loop
    insert into public.erp_customers (id, company_id, name, phone, tax_id, address, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'name', item->>'phone', item->>'taxId', item->>'address', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, name = excluded.name, phone = excluded.phone, tax_id = excluded.tax_id, address = excluded.address, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'suppliers', '[]'::jsonb)) loop
    insert into public.erp_suppliers (id, company_id, name, phone, tax_id, address, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'name', item->>'phone', item->>'taxId', item->>'address', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, name = excluded.name, phone = excluded.phone, tax_id = excluded.tax_id, address = excluded.address, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'logs', '[]'::jsonb)) loop
    insert into public.erp_operation_logs (id, event_time, operator, action, details, raw, synced_at)
    values (item->>'id', item->>'timestamp', item->>'operator', item->>'action', item->>'details', item, p_synced_at)
    on conflict (id) do update set event_time = excluded.event_time, operator = excluded.operator, action = excluded.action, details = excluded.details, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'auditArchive', '[]'::jsonb)) loop
    insert into public.erp_audit_archive (id, collection, record_id, action, actor, reason, archived_at, purge_after, raw, synced_at)
    values (item->>'id', item->>'collection', item->>'recordId', item->>'action', item->>'actor', item->>'reason', public.erp_to_timestamptz(item->>'archivedAt'), public.erp_to_timestamptz(item->>'purgeAfter'), item, p_synced_at)
    on conflict (id) do update set collection = excluded.collection, record_id = excluded.record_id, action = excluded.action, actor = excluded.actor, reason = excluded.reason, archived_at = excluded.archived_at, purge_after = excluded.purge_after, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'journalEntries', '[]'::jsonb)) loop
    insert into public.erp_journal_entries (id, company_id, entry_date, source_type, source_id, status, memo, raw, synced_at)
    values (item->>'id', item->>'companyId', public.erp_to_date(item->>'date'), item->>'sourceType', item->>'sourceId', item->>'status', item->>'memo', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, entry_date = excluded.entry_date, source_type = excluded.source_type, source_id = excluded.source_id, status = excluded.status, memo = excluded.memo, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'journalLines', '[]'::jsonb)) loop
    insert into public.erp_journal_lines (id, entry_id, line_no, side, account_code, amount, memo, raw, synced_at)
    values (item->>'id', item->>'entryId', public.erp_to_numeric(item->>'lineNo', 1)::integer, case when item->>'side' in ('debit', 'credit') then item->>'side' else 'debit' end, item->>'accountCode', public.erp_to_numeric(item->>'amount'), item->>'memo', item, p_synced_at)
    on conflict (id) do update set entry_id = excluded.entry_id, line_no = excluded.line_no, side = excluded.side, account_code = excluded.account_code, amount = excluded.amount, memo = excluded.memo, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasInventoryPeriods', '[]'::jsonb)) loop
    insert into public.erp_gas_inventory_periods (id, company_id, year_month, opening_kg, opening_cost, purchase_kg, purchase_amount, shrinkage_kg, physical_ending_kg, monthly_gas_price, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'yearMonth', public.erp_to_numeric(item->>'openingKg'), public.erp_to_numeric(item->>'openingCost'), public.erp_to_numeric(item->>'purchaseKg'), public.erp_to_numeric(item->>'purchaseAmount'), public.erp_to_numeric(item->>'shrinkageKg'), public.erp_to_numeric(item->>'physicalEndingKg'), coalesce(public.erp_to_numeric(item->>'monthlyGasPrice'), 0), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, year_month = excluded.year_month, opening_kg = excluded.opening_kg, opening_cost = excluded.opening_cost, purchase_kg = excluded.purchase_kg, purchase_amount = excluded.purchase_amount, shrinkage_kg = excluded.shrinkage_kg, physical_ending_kg = excluded.physical_ending_kg, monthly_gas_price = excluded.monthly_gas_price, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasDeliveryVehicles', '[]'::jsonb)) loop
    insert into public.erp_delivery_vehicles (id, company_id, plate_no, vehicle_name, driver_name, capacity_cylinders, capacity_kg, active, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'plateNo', item->>'name', item->>'driverName', public.erp_to_numeric(item->>'capacityCylinders')::integer, public.erp_to_numeric(item->>'capacityKg'), public.erp_to_boolean(item->>'active', true), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, plate_no = excluded.plate_no, vehicle_name = excluded.vehicle_name, driver_name = excluded.driver_name, capacity_cylinders = excluded.capacity_cylinders, capacity_kg = excluded.capacity_kg, active = excluded.active, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasCylinders', '[]'::jsonb)) loop
    insert into public.erp_gas_cylinders (id, company_id, cylinder_no, barcode, qr_code, spec_kg, ownership_status, cylinder_status, location_type, location_id, customer_id, vehicle_id, deposit_amount, last_inspection_date, next_inspection_date, inspection_due_date, raw, synced_at)
    values (
      item->>'id',
      item->>'companyId',
      item->>'cylinderNo',
      item->>'barcode',
      item->>'qrCode',
      public.erp_to_numeric(item->>'specKg'),
      coalesce(nullif(item->>'ownershipStatus', ''), 'owned'),
      case when item->>'status' in ('empty', 'full', 'in_use', 'maintenance', 'lost', 'retired') then item->>'status' else 'empty' end,
      case when item->>'locationType' in ('warehouse', 'vehicle', 'customer', 'supplier', 'maintenance', 'lost', 'retired') then item->>'locationType' else 'warehouse' end,
      item->>'locationId',
      item->>'customerId',
      item->>'vehicleId',
      public.erp_to_numeric(item->>'depositAmount'),
      public.erp_to_date(item->>'lastInspectionDate'),
      public.erp_to_date(item->>'nextInspectionDate'),
      public.erp_to_date(item->>'inspectionDueDate'),
      item,
      p_synced_at
    )
    on conflict (id) do update set company_id = excluded.company_id, cylinder_no = excluded.cylinder_no, barcode = excluded.barcode, qr_code = excluded.qr_code, spec_kg = excluded.spec_kg, ownership_status = excluded.ownership_status, cylinder_status = excluded.cylinder_status, location_type = excluded.location_type, location_id = excluded.location_id, customer_id = excluded.customer_id, vehicle_id = excluded.vehicle_id, deposit_amount = excluded.deposit_amount, last_inspection_date = excluded.last_inspection_date, next_inspection_date = excluded.next_inspection_date, inspection_due_date = excluded.inspection_due_date, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasCylinderMovements', '[]'::jsonb)) loop
    insert into public.erp_gas_cylinder_movements (id, company_id, cylinder_id, movement_date, movement_type, from_location_type, from_location_id, to_location_type, to_location_id, customer_id, vehicle_id, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'cylinderId', public.erp_to_date(item->>'movementDate'), item->>'movementType', item->>'fromLocationType', item->>'fromLocationId', item->>'toLocationType', item->>'toLocationId', item->>'customerId', item->>'vehicleId', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, cylinder_id = excluded.cylinder_id, movement_date = excluded.movement_date, movement_type = excluded.movement_type, from_location_type = excluded.from_location_type, from_location_id = excluded.from_location_id, to_location_type = excluded.to_location_type, to_location_id = excluded.to_location_id, customer_id = excluded.customer_id, vehicle_id = excluded.vehicle_id, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasVehicleInventory', '[]'::jsonb)) loop
    insert into public.erp_vehicle_inventory (id, company_id, vehicle_id, cylinder_id, loaded_at, unloaded_at, status, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'vehicleId', item->>'cylinderId', public.erp_to_timestamptz(item->>'loadedAt'), public.erp_to_timestamptz(item->>'unloadedAt'), coalesce(nullif(item->>'status', ''), 'on_vehicle'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, vehicle_id = excluded.vehicle_id, cylinder_id = excluded.cylinder_id, loaded_at = excluded.loaded_at, unloaded_at = excluded.unloaded_at, status = excluded.status, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'customerCylinderDeposits', '[]'::jsonb)) loop
    insert into public.erp_customer_cylinder_deposits (id, company_id, customer_id, customer_name, cylinder_id, cylinder_spec_kg, deposit_amount, deposit_status, started_at, returned_at, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'customerId', item->>'customerName', item->>'cylinderId', public.erp_to_numeric(item->>'cylinderSpecKg'), public.erp_to_numeric(item->>'depositAmount'), item->>'depositStatus', public.erp_to_date(item->>'startedAt'), public.erp_to_date(item->>'returnedAt'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, customer_id = excluded.customer_id, customer_name = excluded.customer_name, cylinder_id = excluded.cylinder_id, cylinder_spec_kg = excluded.cylinder_spec_kg, deposit_amount = excluded.deposit_amount, deposit_status = excluded.deposit_status, started_at = excluded.started_at, returned_at = excluded.returned_at, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasPurchases', '[]'::jsonb)) loop
    insert into public.erp_gas_purchases (id, company_id, purchase_date, qty_50kg, qty_20kg, qty_16kg, qty_10kg, qty_4kg, empty_50kg, empty_20kg, empty_16kg, empty_10kg, empty_4kg, total_kg, monthly_gas_price, amount, raw, synced_at)
    values (
      item->>'id',
      item->>'companyId',
      public.erp_to_date(item->>'date'),
      coalesce(public.erp_to_numeric(item->>'qty50kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'qty20kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'qty16kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'qty10kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'qty4kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'empty50kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'empty20kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'empty16kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'empty10kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'empty4kg')::integer, 0),
      coalesce(public.erp_to_numeric(item->>'totalKg'), 0),
      coalesce(public.erp_to_numeric(item->>'monthlyGasPrice'), 0),
      coalesce(public.erp_to_numeric(item->>'amount'), 0),
      item,
      p_synced_at
    )
    on conflict (id) do update set
      company_id = excluded.company_id,
      purchase_date = excluded.purchase_date,
      qty_50kg = excluded.qty_50kg,
      qty_20kg = excluded.qty_20kg,
      qty_16kg = excluded.qty_16kg,
      qty_10kg = excluded.qty_10kg,
      qty_4kg = excluded.qty_4kg,
      empty_50kg = excluded.empty_50kg,
      empty_20kg = excluded.empty_20kg,
      empty_16kg = excluded.empty_16kg,
      empty_10kg = excluded.empty_10kg,
      empty_4kg = excluded.empty_4kg,
      total_kg = excluded.total_kg,
      monthly_gas_price = excluded.monthly_gas_price,
      amount = excluded.amount,
      raw = excluded.raw,
      synced_at = excluded.synced_at;
  end loop;
end;
$$;
