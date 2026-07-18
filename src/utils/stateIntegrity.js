const GAS_CYLINDER_STATUSES = new Set([
  'empty',
  'full',
  'residual',
  'maintenance',
  'scrapped',
  // Legacy values remain readable while existing records are migrated.
  'in_use',
  'lost',
  'retired'
]);

const GAS_LOCATION_TYPES = new Set([
  'warehouse',
  'vehicle',
  'customer',
  'filling_station',
  'maintenance_vendor',
  // Legacy values remain readable while existing records are migrated.
  'supplier',
  'maintenance',
  'lost',
  'retired'
]);

const GAS_MOVEMENT_TYPES = new Set([
  'inbound',
  'load_vehicle',
  'deliver_customer',
  'return_from_customer',
  'return_to_warehouse',
  'send_maintenance',
  'scrap',
  'manual_adjustment'
]);

const asArray = (value) => Array.isArray(value) ? value : [];
const asNumber = (value) => Number(value) || 0;
const canonical = (value) => String(value || '').trim().toLowerCase();
const stableStringify = (value) => JSON.stringify(value ?? null);

const duplicateValue = (records, field) => {
  const seen = new Set();
  for (const record of records) {
    const value = canonical(record?.[field]);
    if (!value) continue;
    const key = `${record?.companyId || ''}:${value}`;
    if (seen.has(key)) return record[field];
    seen.add(key);
  }
  return null;
};

export const deriveGasVehicleInventory = (state = {}) => {
  const cylinders = asArray(state.gasCylinders);
  const movements = asArray(state.gasCylinderMovements);

  return cylinders
    .filter(cylinder => cylinder.locationType === 'vehicle' && (cylinder.vehicleId || cylinder.locationId))
    .map((cylinder) => {
      const vehicleId = cylinder.vehicleId || cylinder.locationId;
      const latestMovement = movements
        .filter(movement => movement.cylinderId === cylinder.id && movement.toLocationType === 'vehicle')
        .sort((a, b) => String(b.createdAt || b.movementDate || '').localeCompare(String(a.createdAt || a.movementDate || '')))[0];

      return {
        id: `VINV-${cylinder.companyId || 'COMP'}-${vehicleId}-${cylinder.id}`,
        companyId: cylinder.companyId || '',
        vehicleId,
        cylinderId: cylinder.id,
        loadedAt: latestMovement?.createdAt || latestMovement?.movementDate || cylinder.updatedAt || new Date().toISOString(),
        unloadedAt: '',
        status: 'on_vehicle',
        updatedAt: cylinder.updatedAt || new Date().toISOString()
      };
    });
};

export const validateGasInventoryState = (previousState = {}, nextState = {}) => {
  const cylinders = asArray(nextState.gasCylinders);
  const vehicles = asArray(nextState.gasDeliveryVehicles);
  const movements = asArray(nextState.gasCylinderMovements);
  const deposits = asArray(nextState.customerCylinderDeposits);

  for (const [field, label] of [
    ['id', '鋼瓶資料 ID'],
    ['cylinderNo', '鋼瓶編號'],
    ['barcode', '鋼瓶條碼'],
    ['qrCode', '鋼瓶 QR Code']
  ]) {
    const duplicate = duplicateValue(cylinders, field);
    if (duplicate) return { ok: false, error: `${label}重複：${duplicate}` };
  }

  const duplicatePlate = duplicateValue(vehicles, 'plateNo');
  if (duplicatePlate) return { ok: false, error: `配送車車牌重複：${duplicatePlate}` };

  const vehicleById = new Map(vehicles.map(vehicle => [vehicle.id, vehicle]));
  const cylinderById = new Map(cylinders.map(cylinder => [cylinder.id, cylinder]));

  for (const cylinder of cylinders) {
    if (!cylinder.id || !String(cylinder.cylinderNo || '').trim()) {
      return { ok: false, error: '每支鋼瓶都必須有資料 ID 與鋼瓶編號。' };
    }
    if (!GAS_CYLINDER_STATUSES.has(cylinder.status)) {
      return { ok: false, error: `鋼瓶 ${cylinder.cylinderNo} 的狀態不合法。` };
    }
    if (!GAS_LOCATION_TYPES.has(cylinder.locationType)) {
      return { ok: false, error: `鋼瓶 ${cylinder.cylinderNo} 的所在位置不合法。` };
    }
    if (cylinder.locationType === 'vehicle') {
      const vehicleId = cylinder.vehicleId || cylinder.locationId;
      const vehicle = vehicleById.get(vehicleId);
      if (!vehicle || vehicle.companyId !== cylinder.companyId) {
        return { ok: false, error: `鋼瓶 ${cylinder.cylinderNo} 必須指定同公司的配送車。` };
      }
      if (vehicle.active === false) {
        return { ok: false, error: `鋼瓶 ${cylinder.cylinderNo} 不能裝入已停用的配送車。` };
      }
    }
  }

  for (const vehicle of vehicles) {
    const loaded = cylinders.filter(cylinder => (
      cylinder.companyId === vehicle.companyId &&
      cylinder.locationType === 'vehicle' &&
      (cylinder.vehicleId || cylinder.locationId) === vehicle.id &&
      !['scrapped', 'retired'].includes(cylinder.status)
    ));
    const loadedKg = loaded.reduce((sum, cylinder) => sum + asNumber(cylinder.specKg), 0);
    if (asNumber(vehicle.capacityCylinders) > 0 && loaded.length > asNumber(vehicle.capacityCylinders)) {
      return { ok: false, error: `配送車 ${vehicle.plateNo || vehicle.id} 已超過可載鋼瓶數。` };
    }
    if (asNumber(vehicle.capacityKg) > 0 && loadedKg > asNumber(vehicle.capacityKg)) {
      return { ok: false, error: `配送車 ${vehicle.plateNo || vehicle.id} 已超過可載公斤數。` };
    }
  }

  const previousMovements = new Map(asArray(previousState.gasCylinderMovements).map(item => [item.id, item]));
  const nextMovementIds = new Set();
  for (const movement of movements) {
    if (!movement.id || nextMovementIds.has(movement.id)) {
      return { ok: false, error: '鋼瓶異動紀錄 ID 不可重複或留空。' };
    }
    nextMovementIds.add(movement.id);
    if (!cylinderById.has(movement.cylinderId)) {
      return { ok: false, error: `鋼瓶異動 ${movement.id} 找不到對應鋼瓶。` };
    }
    if (!GAS_MOVEMENT_TYPES.has(movement.movementType)) {
      return { ok: false, error: `鋼瓶異動 ${movement.id} 的異動類型不合法。` };
    }
    const previous = previousMovements.get(movement.id);
    if (previous && stableStringify(previous) !== stableStringify(movement)) {
      return { ok: false, error: `鋼瓶異動 ${movement.id} 已建立，不能回頭修改。` };
    }
  }
  for (const previous of previousMovements.values()) {
    if (!nextMovementIds.has(previous.id)) {
      return { ok: false, error: `鋼瓶異動 ${previous.id} 只能保留，不能刪除。` };
    }
  }

  const activeCylinderIds = new Set();
  for (const deposit of deposits.filter(item => item.depositStatus === 'active' && item.cylinderId)) {
    if (activeCylinderIds.has(deposit.cylinderId)) {
      return { ok: false, error: `鋼瓶 ${deposit.cylinderId} 同時存在多筆押瓶中紀錄。` };
    }
    activeCylinderIds.add(deposit.cylinderId);
    const cylinder = cylinderById.get(deposit.cylinderId);
    if (!cylinder) return { ok: false, error: `押瓶紀錄 ${deposit.id} 找不到對應鋼瓶。` };
    if (cylinder.locationType !== 'customer') {
      return { ok: false, error: `押瓶紀錄 ${deposit.id} 的鋼瓶位置必須是客戶。` };
    }
    if (deposit.customerId && cylinder.customerId && deposit.customerId !== cylinder.customerId) {
      return { ok: false, error: `押瓶紀錄 ${deposit.id} 與鋼瓶所在客戶不一致。` };
    }
  }

  return { ok: true };
};

const flipSide = (side) => side === 'debit' ? 'credit' : 'debit';
const normalizedLine = (side, accountCode, accountName, amount, memo = '') => {
  const numericAmount = asNumber(amount);
  return {
    side: numericAmount < 0 ? flipSide(side) : side,
    accountCode,
    accountName,
    amount: Math.abs(numericAmount),
    memo
  };
};

const taxAmount = (item) => {
  if ((item.taxType || 'taxable') !== 'taxable') return 0;
  if (item.vatAmount !== null && item.vatAmount !== undefined && item.vatAmount !== '') {
    return asNumber(item.vatAmount);
  }
  const amount = asNumber(item.amount);
  return item.taxIncluded === false ? Math.round(amount * 0.05) : Math.round(amount * 0.05 / 1.05);
};

const netAmount = (item) => {
  const amount = asNumber(item.amount);
  if ((item.taxType || 'taxable') !== 'taxable') return amount;
  return item.taxIncluded === false ? amount : amount - taxAmount(item);
};

const liquidAccount = (item, kind) => {
  if (item.paymentMethod === 'receivable') return { code: '1102', name: '應收帳款' };
  if (item.paymentMethod === 'payable') return { code: '2102', name: '應付帳款' };
  if (item.paymentMethod === 'check') {
    return kind === 'income'
      ? { code: '1103', name: '應收票據' }
      : { code: '2103', name: '應付票據' };
  }
  if (item.paymentMethod === 'cash') return { code: '1100', name: '現金' };
  return { code: '1101', name: '銀行存款' };
};

const pushEntry = (entries, lines, header) => {
  const cleanLines = lines.filter(line => line.amount > 0);
  const debit = cleanLines.filter(line => line.side === 'debit').reduce((sum, line) => sum + line.amount, 0);
  const credit = cleanLines.filter(line => line.side === 'credit').reduce((sum, line) => sum + line.amount, 0);
  entries.push({
    ...header,
    status: header.status || 'posted',
    debit,
    credit,
    balanced: Math.abs(debit - credit) < 0.01,
    lines: cleanLines
  });
};

const monthEnd = (year, month) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

const addAssetDepreciationEntries = (entries, asset, today) => {
  if (asset.status !== 'active' || !asset.acquisitionDate) return;
  const cost = asNumber(asset.acquisitionCost);
  const residual = asNumber(asset.residualValue);
  const usefulMonths = Math.max(1, Math.round(asNumber(asset.usefulLifeYears || asset.usefulYears || 1) * 12));
  const monthly = Math.max(0, (cost - residual) / usefulMonths);
  if (!monthly) return;

  const acquired = new Date(`${asset.acquisitionDate}T00:00:00Z`);
  const current = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(acquired.getTime()) || Number.isNaN(current.getTime())) return;

  for (let offset = 0; offset < usefulMonths; offset += 1) {
    const date = new Date(Date.UTC(acquired.getUTCFullYear(), acquired.getUTCMonth() + offset + 1, 0));
    if (date > current) break;
    const dateStr = monthEnd(date.getUTCFullYear(), date.getUTCMonth() + 1);
    pushEntry(entries, [
      normalizedLine('debit', '6201', '折舊費用', monthly),
      normalizedLine('credit', '1599', '累計折舊', monthly)
    ], {
      id: `J-DEP-${asset.id}-${dateStr.slice(0, 7)}`,
      companyId: asset.companyId,
      date: dateStr,
      sourceType: 'depreciation',
      sourceId: asset.id,
      memo: `${asset.assetName || '固定資產'} 每月折舊`
    });
  }
};

export const buildJournalSnapshot = (state = {}, today = new Date().toISOString().slice(0, 10)) => {
  const entries = [];

  for (const item of asArray(state.incomes).filter(row => row.status === 'approved')) {
    const liquid = liquidAccount(item, 'income');
    const vat = taxAmount(item);
    const grossDebit = item.taxIncluded === false ? asNumber(item.amount) + vat : asNumber(item.amount);
    pushEntry(entries, [
      normalizedLine('debit', liquid.code, liquid.name, grossDebit),
      normalizedLine('credit', item.accountCode || '4101', '營業收入', netAmount(item)),
      normalizedLine('credit', '2201', '銷項稅額', vat)
    ], {
      id: `J-${item.id}`,
      companyId: item.companyId,
      date: item.date,
      sourceType: 'income',
      sourceId: item.id,
      memo: item.remarks || '收入傳票'
    });
  }

  for (const item of asArray(state.expenses).filter(row => row.status === 'approved')) {
    const liquid = liquidAccount(item, 'expense');
    const vat = taxAmount(item);
    const grossCredit = item.taxIncluded === false ? asNumber(item.amount) + vat : asNumber(item.amount);
    pushEntry(entries, [
      normalizedLine('debit', item.accountCode || '6101', '營業費用', netAmount(item)),
      normalizedLine('debit', '1191', '進項稅額', vat),
      normalizedLine('credit', liquid.code, liquid.name, grossCredit)
    ], {
      id: `J-${item.id}`,
      companyId: item.companyId,
      date: item.date,
      sourceType: 'expense',
      sourceId: item.id,
      memo: item.remarks || '支出傳票'
    });
  }

  const incomeById = new Map(asArray(state.incomes).map(item => [item.id, item]));
  const expenseById = new Map(asArray(state.expenses).map(item => [item.id, item]));
  for (const settlement of asArray(state.bankTransactions).filter(item => item.sourceType === 'settlement')) {
    const source = settlement.transactionType === 'expense'
      ? expenseById.get(settlement.sourceId)
      : incomeById.get(settlement.sourceId);
    if (!source) continue;
    const sourceAccount = liquidAccount(source, settlement.transactionType);
    const cashAccount = settlement.paymentMethod === 'cash'
      ? { code: '1100', name: '現金' }
      : { code: '1101', name: '銀行存款' };
    const amount = asNumber(settlement.amount);
    const lines = settlement.transactionType === 'expense'
      ? [
          normalizedLine('debit', sourceAccount.code, sourceAccount.name, amount),
          normalizedLine('credit', cashAccount.code, cashAccount.name, amount)
        ]
      : [
          normalizedLine('debit', cashAccount.code, cashAccount.name, amount),
          normalizedLine('credit', sourceAccount.code, sourceAccount.name, amount)
        ];
    pushEntry(entries, lines, {
      id: `J-${settlement.id}`,
      companyId: settlement.companyId,
      date: settlement.date,
      sourceType: 'settlement',
      sourceId: settlement.id,
      memo: settlement.remarks || `結清 ${source.id}`
    });
  }

  for (const item of asArray(state.shareholderLedger)) {
    const isCapitalIn = item.type === 'join' || item.type === 'increase';
    pushEntry(entries, isCapitalIn ? [
      normalizedLine('debit', '1101', '銀行存款/現金', item.amount),
      normalizedLine('credit', '3101', '股本', item.amount)
    ] : [
      normalizedLine('debit', '3101', '股本', item.amount),
      normalizedLine('credit', '1101', '銀行存款/現金', item.amount)
    ], {
      id: `J-${item.id}`,
      companyId: item.companyId,
      date: item.date,
      sourceType: 'equity',
      sourceId: item.id,
      memo: item.remarks || '股東權益傳票'
    });
  }

  for (const asset of asArray(state.fixedAssets)) {
    pushEntry(entries, [
      normalizedLine('debit', '1501', '固定資產', asset.acquisitionCost),
      normalizedLine('credit', '1101', '銀行存款/現金', asset.acquisitionCost)
    ], {
      id: `J-AST-${asset.id}`,
      companyId: asset.companyId,
      date: asset.acquisitionDate,
      sourceType: 'fixed_asset',
      sourceId: asset.id,
      memo: `${asset.assetName || '固定資產'} 購入`
    });
    addAssetDepreciationEntries(entries, asset, today);
  }

  const manualEntries = asArray(state.journalEntries).filter(item => item.sourceType === 'manual');
  const manualLines = asArray(state.journalLines);
  for (const manual of manualEntries) {
    const lines = manualLines
      .filter(line => line.entryId === manual.id)
      .map(line => normalizedLine(line.side, line.accountCode, line.accountName || '', line.amount, line.memo));
    pushEntry(entries, lines, manual);
  }

  const journalEntries = entries
    .sort((a, b) => `${a.date}:${a.id}`.localeCompare(`${b.date}:${b.id}`))
    .map(({ lines: _lines, ...entry }) => ({
      ...entry,
      createdAt: entry.createdAt || new Date().toISOString(),
      createdBy: entry.createdBy || 'SYSTEM'
    }));
  const journalLines = entries.flatMap(entry => entry.lines.map((line, index) => ({
    id: `JLN-${entry.id}-${index + 1}`,
    entryId: entry.id,
    lineNo: index + 1,
    side: line.side,
    accountCode: line.accountCode,
    accountName: line.accountName,
    amount: line.amount,
    memo: line.memo || entry.memo || ''
  })));

  return { journalEntries, journalLines };
};

export const prepareStateForPersistence = (state = {}) => {
  const prepared = { ...state };
  prepared.gasVehicleInventory = deriveGasVehicleInventory(prepared);
  const journals = buildJournalSnapshot(prepared);
  prepared.journalEntries = journals.journalEntries;
  prepared.journalLines = journals.journalLines;
  return prepared;
};
