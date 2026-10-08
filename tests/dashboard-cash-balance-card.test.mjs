import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canViewOwnerCashBalance, canViewCapitalDifference } from '../src/utils/ownerCashAccess.js';
import { INITIAL_BANKS } from '../src/db/mockData.js';

test('permissions: cash balance card is accessible to admin and shareholders, but blocked for bookkeeper', () => {
  assert.equal(canViewOwnerCashBalance('admin'), true);
  assert.equal(canViewOwnerCashBalance('business_reviewer'), true);
  assert.equal(canViewOwnerCashBalance('readonly_shareholder'), true);
  assert.equal(canViewOwnerCashBalance('bookkeeper'), false);
  assert.equal(canViewOwnerCashBalance(null), false);
  assert.equal(canViewOwnerCashBalance(''), false);
});

test('permissions: capital difference card (資差) is accessible only to Yang Meng-Long admin', () => {
  assert.equal(canViewCapitalDifference('admin', { name: '楊孟龍' }), true);
  assert.equal(canViewCapitalDifference('admin', { name: '主管理員' }), true);
  assert.equal(canViewCapitalDifference('admin', { id: 'ADMIN' }), true);
  assert.equal(canViewCapitalDifference('admin', { email: 'qazwsx32100@gmail.com' }), true);
  assert.equal(canViewCapitalDifference('admin', { id: 'SH001' }), true);
  assert.equal(canViewCapitalDifference('business_reviewer', { name: '周子傑' }), false);
  assert.equal(canViewCapitalDifference('business_reviewer', { name: '林曄鏵' }), false);
  assert.equal(canViewCapitalDifference('bookkeeper', { name: '會計' }), false);
  assert.equal(canViewCapitalDifference(null, null), false);
});

test('UI card: DashboardView renders clean card title, tooltip, and interactive link without owner personal names', () => {
  const source = readFileSync(new URL('../src/pages/DashboardView.jsx', import.meta.url), 'utf8');

  // Verify card header and labels
  assert.ok(source.includes('<span className="metric-label">目前資金結餘</span>'), 'Card must have label 目前資金結餘');
  assert.ok(source.includes('title="點擊查看公司資金結餘與銀行帳戶分佈"'), 'Card must have title 點擊查看公司資金結餘與銀行帳戶分佈');
  assert.ok(source.includes('點擊查看分佈 ➔'), 'Card link must be 點擊查看分佈 ➔');

  // Verify removal of sensitive personal names and manager-only tags
  assert.ok(!source.includes('目前資金結餘（管理人專用）'), 'Card title must not contain 管理人專用');
  assert.ok(!source.includes('楊孟龍專用'), 'Card must not contain 楊孟龍專用');
  assert.ok(!source.includes('僅楊孟龍管理員可查看'), 'Tooltip must not contain 楊孟龍');

  // Verify button click event binding
  assert.ok(source.includes("onClick={() => openDetailModal('cash')}"), 'Card must open cash detail modal on click');

  // Verify modal close triggers
  assert.ok(source.includes("onClick={() => setActiveDetailModal(null)}"), 'Modal must have backdrop and close button handlers');

  // Verify modal table uses 合作金庫
  assert.ok(source.includes('🏦 合作金庫｜公司可動用資金'), 'Modal bank account label must display 合作金庫');
  assert.ok(source.includes('🏛️ 合作金庫｜保留公積金專款'), 'Modal must display 合作金庫保留公積金專款');
  assert.ok(!source.includes('🏦 第一銀行'), 'Modal must not contain 第一銀行');
  assert.ok(!source.includes('🏦 玉山銀行'), 'Modal must not contain 玉山銀行');

  // Verify 3-column breakdown and formula (totalFunds = reserveCash + availableFunds + accumulatedReserve)
  assert.ok(source.includes('const availableFunds = totalFunds - reserveCash - accumulatedReserve;'), 'availableFunds must equal totalFunds - reserveCash - accumulatedReserve');
  assert.ok(source.includes('COMPANY_RESERVE_CASH'), 'Must use COMPANY_RESERVE_CASH for reserveCash');
  assert.ok(source.includes('getCumulativeDividendReserve'), 'Must call getCumulativeDividendReserve');
  assert.ok(source.includes('保留公積金 (累計)'), 'Must render 保留公積金 (累計)');
  assert.ok(source.includes('(含本月提撥：'), 'Must show monthly reserve hint in card');

  // Verify cumulative revenue and expense end at selected period with Option A dynamic labels
  assert.ok(source.includes('cumulativePeriodSummary'), 'Must calculate cumulativePeriodSummary based on periodVal');
  assert.ok(source.includes('115 年 7 月～${m} 月 累計總收入'), 'Label must dynamically show 115 年 7 月～${m} 月 累計總收入');
  assert.ok(source.includes('115 年 7 月 當期總收入'), 'Label must show 115 年 7 月 當期總收入 for start month');
  assert.ok(source.includes('income: Number(cashBalanceBreakdown?.cashIncome || 0)'), 'Income must tie to cashBalanceBreakdown ending at selected month');
  assert.ok(source.includes('expense: Number(cashBalanceBreakdown?.cashExpense || 0)'), 'Expense must tie to cashBalanceBreakdown ending at selected month');

  // Verify 資差 card and formula (全部營收 - 全部支出 - 公設基金 - 635000)
  assert.ok(source.includes('<span className="metric-label">資差</span>'), 'Card must have label 資差');
  assert.ok(source.includes("openDetailModal('capitalDiff')"), 'Card must open capitalDiff modal on click');
  assert.ok(source.includes('activeDetailModal === \'capitalDiff\''), 'Modal must support capitalDiff view');
  assert.ok(source.includes('635000'), 'Formula must subtract 635,000 shareholder equity');
});

test('data layer: initial bank configuration uses 合作金庫 and petty cash 4500', () => {
  assert.ok(INITIAL_BANKS.some(b => b.name && b.name.includes('合作金庫')), 'INITIAL_BANKS must contain 合作金庫');
  assert.ok(!INITIAL_BANKS.some(b => b.name && (b.name.includes('第一銀行') || b.name.includes('玉山銀行'))), 'INITIAL_BANKS must not contain 第一銀行 or 玉山銀行');
  const petty = INITIAL_BANKS.find(b => b.id === 'BANK_PETTY');
  assert.equal(petty?.initialBalance, 4500, 'BANK_PETTY initialBalance must be 4500');
});

test('financials: COMPANY_RESERVE_CASH is defined as 4500 and getCumulativeDividendReserve is exported', () => {
  const finSource = readFileSync(new URL('../src/utils/financials.js', import.meta.url), 'utf8');
  assert.ok(finSource.includes('export const COMPANY_RESERVE_CASH = 4500;'), 'COMPANY_RESERVE_CASH must be exported as 4500');
  assert.ok(finSource.includes('export const getCumulativeDividendReserve = (companyId, targetYearMonth) => {'), 'getCumulativeDividendReserve must be exported');
  assert.ok(finSource.includes('while (curY < endYear || (curY === endYear && curM <= endMonth))'), 'Must iterate months from 2026-07 to targetYearMonth');
});
