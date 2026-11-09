/**
 * merge-offline-finance.cjs
 * 將舊 ERP 財務同步 Payload 正規化寫入本地 _offline_state.json 快照
 */

const fs = require('fs');
const path = require('path');

function mergeOfflineFinance(payloadPath) {
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`找不到 Payload 檔案: ${payloadPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8').replace(/^\uFEFF/, ''));
  const offlinePath = path.join(__dirname, '../api/_offline_state.json');
  if (!fs.existsSync(offlinePath)) {
    throw new Error(`找不到 _offline_state.json: ${offlinePath}`);
  }

  const root = JSON.parse(fs.readFileSync(offlinePath, 'utf8').replace(/^\uFEFF/, ''));
  const state = root.state || {};

  // 1. 建立安全備份至 backups/（由 .gitignore 忽略，避免雜物部署）
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupPath = path.join(backupDir, `backup_pre_sync_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(root, null, 2), 'utf8');

  // 2. 處理 incomes (以 payload 中的收入更新，去除舊的 shenglong 收入並替換)
  const incomingIncomes = payload.incomes || [];
  const incomingIncomeIds = new Set(incomingIncomes.map(i => i.id));
  
  // 保留非 shenglong 來源且不在 incoming 中的收入
  const keptIncomes = (state.incomes || []).filter(item => {
    if (incomingIncomeIds.has(item.id)) return false;
    if (item.syncSource === 'shenglong') return false;
    return true;
  });

  const mergedIncomes = [...keptIncomes, ...incomingIncomes].map(item => ({
    ...item,
    effectiveForReport: (item.status === 'approved' || !item.status) &&
      !['corrected', 'superseded'].includes(item.correctionStatus) &&
      !['reversal', 'void'].includes(item.correctionType)
  }));

  // 3. 處理 expenses (舊 ERP 僅同步退押金，嚴格保留所有人工與試算表費用，如10月60筆$785,970)
  // 注意：10月份的 5 筆退押金在 10 月初次稽核時已由 Google 試算表以 EXP202610_SHEET_* 形式入帳（60筆/$785,970基線）
  // 故 2026-10 的 SL-SYNC-EXP-BARREL-REFUND-* 不應重複加入
  const incomingExpenses = (payload.expenses || []).filter(e => {
    if (e.date && e.date.startsWith('2026-10') && (e.id || '').startsWith('SL-SYNC-EXP-BARREL-REFUND-')) {
      return false;
    }
    return true;
  });
  const incomingExpenseIds = new Set(incomingExpenses.map(e => e.id));

  const keptExpenses = (state.expenses || []).filter(item => {
    if (incomingExpenseIds.has(item.id)) return false;
    // 僅移除舊系統來源之退押金，其餘所有營業費用100%保留
    if (item.syncSource === 'shenglong' && (item.syncType === 'barrel_refund' || (item.remarks || '').includes('退押'))) {
      return false;
    }
    return true;
  });

  const mergedExpenses = [...keptExpenses, ...incomingExpenses].map(item => ({
    ...item,
    effectiveForReport: (item.status === 'approved' || !item.status) &&
      !['corrected', 'superseded'].includes(item.correctionStatus) &&
      !['reversal', 'void'].includes(item.correctionType)
  }));

  // 4. 處理 bankTransactions
  const incomingBankTx = payload.bankTransactions || [];
  const incomingBankIds = new Set(incomingBankTx.map(b => b.id));
  const keptBankTx = (state.bankTransactions || []).filter(item => {
    if (incomingBankIds.has(item.id)) return false;
    if (item.syncSource === 'shenglong') return false;
    return true;
  });
  const mergedBankTx = [...keptBankTx, ...incomingBankTx];

  // 5. 處理 gasPurchases
  const incomingPurchases = payload.gasPurchases || [];
  const keptPurchases = (state.gasPurchases || []).filter(item => item.syncSource !== 'shenglong');
  const mergedPurchases = [...keptPurchases, ...incomingPurchases];

  // 6. 處理 customers (僅更新盛隆代號客戶之欠款與資料)
  const incomingCustomers = payload.customers || [];
  const customerMap = new Map();
  (state.customers || []).forEach(c => customerMap.set(c.id, c));
  incomingCustomers.forEach(c => customerMap.set(c.id, { ...(customerMap.get(c.id) || {}), ...c }));
  const mergedCustomers = Array.from(customerMap.values());

  // 7. 驗證無重複 ID
  const checkUnique = (list, name) => {
    const seen = new Set();
    for (const it of list) {
      if (seen.has(it.id)) {
        throw new Error(`${name} 出現重複 ID: ${it.id}`);
      }
      seen.add(it.id);
    }
  };
  checkUnique(mergedIncomes, 'incomes');
  checkUnique(mergedExpenses, 'expenses');
  checkUnique(mergedBankTx, 'bankTransactions');

  // 8. 驗證 10 月份費用完全不受破壞 (防護回歸)
  const octExpenses = mergedExpenses.filter(e => e.date && e.date.startsWith('2026-10') && e.effectiveForReport);
  const octTotal = octExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  if (octExpenses.length !== 60 || Math.round(octTotal) !== 785970) {
    throw new Error(`10月份費用檢核失敗: 預期 60 筆 $785,970，實得 ${octExpenses.length} 筆 $${octTotal}`);
  }

  // 9. 組裝新 State 並存檔
  const nextState = {
    ...state,
    incomes: mergedIncomes,
    expenses: mergedExpenses,
    bankTransactions: mergedBankTx,
    gasPurchases: mergedPurchases,
    customers: mergedCustomers,
    journalEntries: payload.journalEntries || state.journalEntries || [],
    journalLines: payload.journalLines || state.journalLines || []
  };

  const nextRoot = {
    state: nextState,
    updated_at: new Date().toISOString(),
    updated_by: 'shenglong_failover_sync'
  };

  fs.writeFileSync(offlinePath, JSON.stringify(nextRoot, null, 2), 'utf8');
  console.log(`✅ [mergeOfflineFinance] 離線快照更新成功:
  - 總收入筆數: ${mergedIncomes.length}
  - 總費用筆數: ${mergedExpenses.length} (10月維持 60 筆 $785,970)
  - 銀行流水筆數: ${mergedBankTx.length}
  - 採購進氣筆數: ${mergedPurchases.length}
  - 備份位置: ${backupPath}
  `);

  return {
    success: true,
    totalIncomes: mergedIncomes.length,
    totalExpenses: mergedExpenses.length,
    backupPath
  };
}

if (require.main === module) {
  const payloadPath = process.argv[2] || path.join(__dirname, '../../shenglong-next/temp_payload.json');
  try {
    mergeOfflineFinance(payloadPath);
  } catch (err) {
    console.error('❌ 合併失敗:', err.message);
    process.exit(1);
  }
}

module.exports = { mergeOfflineFinance };
