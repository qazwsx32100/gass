import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactEmbeddedBackups,
  prepareStateForPersistence
} from '../src/utils/stateIntegrity.js';

test('embedded daily backups keep metadata without recursively nesting snapshots', () => {
  const backups = [{
    id: 'BAK-1',
    backupDate: '2026-07-24',
    snapshot: {
      incomes: [{ id: 'INC-1' }],
      dailyBackups: [{ id: 'OLDER', snapshot: { incomes: [] } }]
    }
  }];

  const compacted = compactEmbeddedBackups(backups);

  assert.deepEqual(compacted, [{
    id: 'BAK-1',
    backupDate: '2026-07-24',
    storage: 'cloud_backup_table'
  }]);
  assert.ok('snapshot' in backups[0], 'source data should not be mutated');
});

test('state persistence always compacts legacy daily backup snapshots', () => {
  const prepared = prepareStateForPersistence({
    dailyBackups: [{ id: 'BAK-1', snapshot: { expenses: [{ id: 'EXP-1' }] } }]
  });

  assert.equal(prepared.dailyBackups.length, 1);
  assert.equal(prepared.dailyBackups[0].storage, 'cloud_backup_table');
  assert.equal('snapshot' in prepared.dailyBackups[0], false);
});
