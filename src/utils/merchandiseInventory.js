import { isEffectiveForReport } from './reportEligibility.js';

const isActive = isEffectiveForReport;

export const isMerchandisePurchaseAccount = code => /^5102\d+$/.test(String(code || ''));
export const isMerchandiseSalesAccount = code => /^4104\d+$/.test(String(code || ''));

export const getMatchingMerchandiseAccount = code => {
  const value = String(code || '');
  if (isMerchandisePurchaseAccount(value)) return `4104${value.slice(4)}`;
  if (isMerchandiseSalesAccount(value)) return `5102${value.slice(4)}`;
  return '';
};

export const getMerchandiseStock = ({ companyId, accountCode, incomes = [], expenses = [], excludeId = '' } = {}) => {
  const purchaseCode = isMerchandisePurchaseAccount(accountCode)
    ? String(accountCode)
    : getMatchingMerchandiseAccount(accountCode);
  const salesCode = isMerchandiseSalesAccount(accountCode)
    ? String(accountCode)
    : getMatchingMerchandiseAccount(accountCode);
  if (!purchaseCode || !salesCode) return null;

  const purchased = expenses
    .filter(item => item.id !== excludeId && item.companyId === companyId && item.accountCode === purchaseCode && isActive(item))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const sold = incomes
    .filter(item => item.id !== excludeId && item.companyId === companyId && item.accountCode === salesCode && isActive(item))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return { purchaseCode, salesCode, purchased, sold, available: purchased - sold };
};

export const validateMerchandiseTransaction = ({ kind, companyId, accountCode, quantity, incomes = [], expenses = [], excludeId = '' } = {}) => {
  const controlled = kind === 'income'
    ? isMerchandiseSalesAccount(accountCode)
    : isMerchandisePurchaseAccount(accountCode);
  if (!controlled) return { valid: true, controlled: false, stock: null };
  const normalizedQuantity = Number(quantity || 0);
  const stock = getMerchandiseStock({ companyId, accountCode, incomes, expenses, excludeId });
  if (normalizedQuantity <= 0) {
    return { valid: false, controlled: true, stock, message: '爐具與瓦斯零件進銷必須填寫數量。' };
  }
  if (kind === 'income' && normalizedQuantity > Number(stock?.available || 0)) {
    return {
      valid: false,
      controlled: true,
      stock,
      message: `庫存不足：目前可售 ${Number(stock?.available || 0).toLocaleString()} 件，本次銷售 ${normalizedQuantity.toLocaleString()} 件。請先登錄並核准進貨。`
    };
  }
  return { valid: true, controlled: true, stock };
};
