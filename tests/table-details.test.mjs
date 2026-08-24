import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTableDetail, parseDetailMetadata } from '../src/utils/tableDetails.js';

test('builds a readable detail from every visible data column', () => {
  const detail = buildTableDetail({
    headers: ['發生日期', '項目', '金額', '操作'],
    cells: ['2026-07-01', '押瓶收入', '$1,500', '編輯 刪除'],
    context: '當月營業額與實收明細'
  });

  assert.equal(detail.context, '當月營業額與實收明細');
  assert.deepEqual(detail.fields, [
    { label: '發生日期', value: '2026-07-01' },
    { label: '項目', value: '押瓶收入' },
    { label: '金額', value: '$1,500' }
  ]);
});

test('adds hidden record metadata without duplicating visible labels', () => {
  const extraFields = parseDetailMetadata(JSON.stringify({
    '客戶': '王先生',
    '聯絡電話': '02-0000-0000',
    '備註': '押金收入'
  }));
  const detail = buildTableDetail({
    headers: ['客戶', '金額'],
    cells: ['王先生', '$500'],
    extraFields,
    title: '押金明細'
  });

  assert.equal(detail.title, '押金明細');
  assert.deepEqual(detail.fields.map(field => field.label), ['客戶', '金額', '聯絡電話', '備註']);
});

test('ignores malformed optional metadata', () => {
  assert.deepEqual(parseDetailMetadata('{not-json'), []);
});
