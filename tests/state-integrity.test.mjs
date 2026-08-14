import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJournalSnapshot,
  deriveGasVehicleInventory,
  validateGasInventoryState
} from '../src/utils/stateIntegrity.js';

const vehicle = {
  id: 'VEH001',
  companyId: 'COMP001',
  plateNo: 'ABC-1234',
  capacityCylinders: 2,
  capacityKg: 40,
  active: true
};

const cylinder = {
  id: 'CYL001',
  companyId: 'COMP001',
  cylinderNo: 'CYL-001',
  specKg: 20,
  status: 'full',
  locationType: 'vehicle',
  locationId: vehicle.id,
  vehicleId: vehicle.id
};

test('derives current delivery vehicle inventory from cylinder locations', () => {
  const inventory = deriveGasVehicleInventory({
    gasCylinders: [cylinder],
    gasCylinderMovements: [{
      id: 'MOV001',
      cylinderId: cylinder.id,
      toLocationType: 'vehicle',
      createdAt: '2026-07-16T08:00:00.000Z'
    }]
  });

  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].vehicleId, vehicle.id);
  assert.equal(inventory[0].cylinderId, cylinder.id);
  assert.equal(inventory[0].status, 'on_vehicle');
});

test('rejects delivery vehicle inventory above configured capacity', () => {
  const result = validateGasInventoryState({}, {
    gasDeliveryVehicles: [{ ...vehicle, capacityCylinders: 1 }],
    gasCylinders: [cylinder, { ...cylinder, id: 'CYL002', cylinderNo: 'CYL-002' }],
    gasCylinderMovements: [],
    customerCylinderDeposits: []
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /超過可載鋼瓶數/);
});

test('keeps cylinder movement history append-only', () => {
  const before = {
    gasDeliveryVehicles: [vehicle],
    gasCylinders: [cylinder],
    gasCylinderMovements: [{
      id: 'MOV001',
      companyId: 'COMP001',
      cylinderId: cylinder.id,
      movementType: 'load_vehicle',
      movementDate: '2026-07-16'
    }],
    customerCylinderDeposits: []
  };
  const after = {
    ...before,
    gasCylinderMovements: [{ ...before.gasCylinderMovements[0], movementType: 'manual_adjustment' }]
  };

  const result = validateGasInventoryState(before, after);

  assert.equal(result.ok, false);
  assert.match(result.error, /不能回頭修改/);
});

test('builds balanced VAT and settlement journal entries', () => {
  const snapshot = buildJournalSnapshot({
    incomes: [{
      id: 'INC001',
      companyId: 'COMP001',
      date: '2026-07-01',
      status: 'approved',
      paymentMethod: 'receivable',
      accountCode: '4101',
      amount: 1050,
      taxType: 'taxable',
      taxIncluded: true
    }],
    expenses: [],
    shareholderLedger: [],
    fixedAssets: [],
    bankTransactions: [{
      id: 'SET001',
      companyId: 'COMP001',
      date: '2026-07-10',
      sourceType: 'settlement',
      sourceId: 'INC001',
      transactionType: 'income',
      paymentMethod: 'bank_transfer',
      amount: 1050
    }]
  }, '2026-07-16');

  assert.equal(snapshot.journalEntries.length, 2);
  assert.ok(snapshot.journalEntries.every(entry => entry.balanced));
  assert.equal(snapshot.journalLines.filter(line => line.entryId === 'J-INC001').length, 3);
  assert.equal(snapshot.journalLines.find(line => line.accountCode === '2201').amount, 50);
});

test('builds a balanced journal entry for aggregate receivable collection', () => {
  const snapshot = buildJournalSnapshot({
    incomes: [],
    expenses: [],
    shareholderLedger: [],
    fixedAssets: [],
    bankTransactions: [{
      id: 'SET-AR-001',
      companyId: 'COMP001',
      date: '2026-08-01',
      sourceType: 'settlement',
      transactionType: 'income',
      settlementCategory: 'current_debt',
      paymentMethod: 'cash',
      amount: 800
    }]
  }, '2026-08-01');

  assert.equal(snapshot.journalEntries.length, 1);
  assert.equal(snapshot.journalEntries[0].balanced, true);
  assert.equal(snapshot.journalLines.find(line => line.accountCode === '1100').amount, 800);
  assert.equal(snapshot.journalLines.find(line => line.accountCode === '1102').amount, 800);
});

test('excludes void source records and linked settlements from journals', () => {
  const snapshot = buildJournalSnapshot({
    incomes: [{
      id: 'INC-VOID',
      companyId: 'COMP001',
      date: '2026-08-01',
      status: 'void',
      paymentMethod: 'receivable',
      accountCode: '4101',
      amount: 2000
    }],
    expenses: [],
    shareholderLedger: [],
    fixedAssets: [],
    bankTransactions: [{
      id: 'SET-VOID',
      companyId: 'COMP001',
      date: '2026-08-05',
      status: 'void',
      sourceType: 'settlement',
      sourceId: 'INC-VOID',
      transactionType: 'income',
      paymentMethod: 'cash',
      amount: 2000
    }]
  }, '2026-08-05');

  assert.equal(snapshot.journalEntries.length, 0);
  assert.equal(snapshot.journalLines.length, 0);
});
