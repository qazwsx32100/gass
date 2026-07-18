import React, { useEffect, useState, useMemo } from 'react';
import {
  getCompanies, saveCompanies,
  getShareholders, saveShareholders,
  getAdminDisplayName,
  getBanks, saveBanks,
  getChartOfAccounts, saveChartOfAccounts,
  initializeDB, exportBackup, importBackup,
  USER_ROLES, getRoleLabel,
  archiveChange, archiveDeletion, archiveResetSnapshot,
  getAuditArchive,
  getAdminSecurity,
  getPeriodLocks, setPeriodLock,
  setAccountDisabled, approveDevice, rejectDevice, revokeDevice,
  getBudgets, saveBudgets,
  getSystemConfig, saveSystemConfig
} from '../db/storage';
import { canEditShareholderSettings, canViewShareholderInfo, SENSITIVE_BOOKKEEPER_TABS } from '../utils/permissions';
import { getAuditReadinessReport, getShareholderSharesAtDate } from '../utils/financials';
import { createManualCloudBackup, getLastCloudSyncError, listCloudBackups, restoreCloudBackup } from '../db/supabaseService';
import GoLiveView from './GoLiveView';

export default function SettingsView({ triggerRefresh, onDataChange, showToast, isAdmin, userRole }) {
  const [innerTab, setInnerTab] = useState('shareholder');
  const activeSettingsTab = isAdmin ? innerTab : 'shareholder';
  const setActiveSettingsTab = setInnerTab;
  const canViewShareholders = canViewShareholderInfo(userRole);
  const canEditShareholders = canEditShareholderSettings(userRole);
  
  // Data Lists
  const shareholders = useMemo(() => getShareholders(), [triggerRefresh]);
  const banks = useMemo(() => getBanks(), [triggerRefresh]);
  const accounts = useMemo(() => getChartOfAccounts(), [triggerRefresh]);
  const companies = useMemo(() => getCompanies(), [triggerRefresh]);
  const adminSecurity = useMemo(() => getAdminSecurity(), [triggerRefresh]);
  const periodLocks = useMemo(() => getPeriodLocks(), [triggerRefresh]);
  
  // Budget & System Config States
  const [systemConfig, setSystemConfig] = useState(() => getSystemConfig());
  const [budgetCompanyId, setBudgetCompanyId] = useState(companies[0]?.id || 'COMP001');
  const [budgetYear, setBudgetYear] = useState(2026);
  const [budgetMonth, setBudgetMonth] = useState('06');
  const [budgets, setBudgets] = useState(() => getBudgets());
  const [cloudBackups, setCloudBackups] = useState([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState(() => {
    const draftMap = {};
    getBudgets().forEach(b => {
      draftMap[`${b.companyId}_${b.year}_${b.month}_${b.accountCode}`] = b.budgetAmount;
    });
    return draftMap;
  });

  const expenseAndCogsAccounts = useMemo(() => {
    return accounts.filter(a => a.type === 'expense' || a.type === 'cogs');
  }, [accounts]);

  useEffect(() => {
    if (activeSettingsTab === 'backup') {
      refreshCloudBackups();
    }
  }, [activeSettingsTab, triggerRefresh]);

  const handleBudgetDraftChange = (code, val) => {
    const budgetKey = `${budgetCompanyId}_${budgetYear}_${budgetMonth}_${code}`;
    setBudgetDrafts(prev => ({
      ...prev,
      [budgetKey]: val === '' ? undefined : parseFloat(val) || 0
    }));
  };

  const handleSaveBudgets = () => {
    const newBudgets = [];
    Object.entries(budgetDrafts).forEach(([key, amount]) => {
      if (amount === undefined || amount === null) return;
      const [cId, yr, mo, code] = key.split('_');
      newBudgets.push({
        id: `BGT_${cId}_${yr}_${mo}_${code}`,
        companyId: cId,
        year: parseInt(yr, 10),
        month: mo,
        accountCode: code,
        budgetAmount: amount
      });
    });

    saveBudgets(newBudgets);
    setBudgets(newBudgets);
    showToast('預算設定已儲存。', 'success');
    onDataChange();
  };

  const securityUsers = useMemo(() => [
    {
      id: 'ADMIN',
      name: getAdminDisplayName(),
      email: 'qazwsx32100@gmail.com',
      role: USER_ROLES.ADMIN,
      ...adminSecurity
    },
    ...shareholders
  ], [adminSecurity, shareholders]);
  const shareholderSummary = useMemo(() => {
    const companyId = companies[0]?.id;
    if (!companyId) return {};
    const summary = getShareholderSharesAtDate(companyId, '2099-12-31');
    return summary.shareholders.reduce((map, item) => {
      map[item.shareholderId] = item;
      return map;
    }, {});
  }, [companies, triggerRefresh]);

  const getCloudSyncFailureMessage = (prefix) => {
    const cloudError = getLastCloudSyncError();
    return `${prefix}：${cloudError?.error || '請稍後再試。'}`;
  };

  // Modal forms
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Extended Form States
  const [formData, setFormData] = useState({
    // Shareholder
    name: '',
    email: '',
    idCard: '',
    phone: '',
    password: '',
    role: USER_ROLES.READONLY_SHAREHOLDER,
    allowedCompanies: [], // Array of company IDs
    allowedTabs: ['dashboard'], // dashboard, reports, inputs
    
    // Bank
    companyId: '',
    bankName: '',
    accountNo: '',
    initialBalance: '',
    
    // Account Chart
    code: '',
    accountName: '',
    type: 'expense', // revenue, cogs, expense
    desc: '',
    
    // Company
    compName: '',
    compDesc: ''
  });
  const [periodLockForm, setPeriodLockForm] = useState({
    companyId: companies[0]?.id || '',
    yearMonth: new Date().toISOString().slice(0, 7),
    remarks: ''
  });
  const closeReadiness = useMemo(() => {
    const companyId = periodLockForm.companyId || companies[0]?.id || '';
    const yearMonth = periodLockForm.yearMonth || new Date().toISOString().slice(0, 7);
    if (!companyId || !yearMonth) {
      return { score: 0, pendingRows: [], unbalancedEntries: [], approvedWithoutAttachment: [], taxableWithoutInvoice: [] };
    }
    return getAuditReadinessReport(companyId, 'month', yearMonth);
  }, [periodLockForm.companyId, periodLockForm.yearMonth, companies, triggerRefresh]);
  const closeBlockers = (closeReadiness.pendingRows?.length || 0) + (closeReadiness.unbalancedEntries?.length || 0);

  const handlePeriodLockToggle = async (locked) => {
    const targetCompanyId = periodLockForm.companyId || companies[0]?.id || '';
    if (!targetCompanyId || !periodLockForm.yearMonth) {
      window.alert('請選擇公司與月份。');
      return;
    }


    if (locked && closeBlockers > 0) {
      window.alert(`關帳前仍有 ${closeBlockers} 個必須處理的項目：待審資料或傳票不平衡。請先處理完再關帳。`);
      return;
    }
    const confirmed = window.confirm(`${locked ? '鎖定' : '重新開放'} ${periodLockForm.yearMonth}？`);
    if (!confirmed) return;

    const ok = setPeriodLock({
      companyId: targetCompanyId,
      yearMonth: periodLockForm.yearMonth,
      locked,
      actor: getAdminDisplayName(),
      remarks: periodLockForm.remarks,
      closeScore: closeReadiness.score,
      closeChecklist: {
        score: closeReadiness.score,
        pendingCount: closeReadiness.pendingRows?.length || 0,
        unbalancedCount: closeReadiness.unbalancedEntries?.length || 0,
        missingReceiptCount: closeReadiness.approvedWithoutAttachment?.length || 0,
        missingInvoiceCount: closeReadiness.taxableWithoutInvoice?.length || 0,
        checkedAt: new Date().toISOString()
      }
    });
    if (!ok) {
      showToast('月份鎖定設定失敗。', 'error');
      return;
    }

    const cloudSaved = await onDataChange();
    showToast(
      cloudSaved === false ? getCloudSyncFailureMessage('本機已更新，但雲端同步失敗') : locked ? '月份已鎖定。' : '月份已重新開放。',
      cloudSaved === false ? 'error' : 'success'
    );
  };

  // Open modal to add
  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      name: '', 
      email: '', 
      idCard: '', 
      phone: '',
      password: '',
      role: USER_ROLES.BOOKKEEPER,
      allowedCompanies: companies.map(c => c.id), // Authorize all companies by default
      allowedTabs: ['dashboard', 'reports', 'inputs'],
      
      companyId: companies[0]?.id || '',
      bankName: '', 
      accountNo: '', 
      initialBalance: '0',
      
      code: '', 
      accountName: '', 
      type: 'expense', 
      desc: '',
      
      compName: '', 
      compDesc: ''
    });
    setIsModalOpen(true);
  };

  // Open modal to edit
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    if (activeSettingsTab === 'shareholder') {
      setFormData({
        ...formData,
        name: item.name || '',
        email: item.email || '',
        idCard: item.idCard || '',
        phone: item.phone || '',
        password: '',
        role: item.role || USER_ROLES.READONLY_SHAREHOLDER,
        allowedCompanies: item.allowedCompanies || [],
        allowedTabs: item.allowedTabs || [],
        requiresPasswordChange: item.requiresPasswordChange ?? true,
        disabled: item.disabled ?? false
      });
    } else if (activeSettingsTab === 'bank') {
      setFormData({
        ...formData,
        companyId: item.companyId || '',
        bankName: item.name || '',
        accountNo: item.accountNo || '',
        initialBalance: String(item.initialBalance || 0)
      });
    } else if (activeSettingsTab === 'accounts') {
      setFormData({
        ...formData,
        code: item.code || '',
        accountName: item.name || '',
        type: item.type || 'expense',
        desc: item.desc || ''
      });
    } else if (activeSettingsTab === 'company') {
      setFormData({
        ...formData,
        compName: item.name || '',
        compDesc: item.desc || ''
      });
    }
    setIsModalOpen(true);
  };

  // Toggle company checkbox
  const handleCompanyToggle = (cId) => {
    setFormData(prev => {
      const allowed = prev.allowedCompanies.includes(cId)
        ? prev.allowedCompanies.filter(id => id !== cId)
        : [...prev.allowedCompanies, cId];
      return { ...prev, allowedCompanies: allowed };
    });
  };

  // Toggle tab checkbox
  const handleTabToggle = (tId) => {
    setFormData(prev => {
      if (
        prev.role === USER_ROLES.BOOKKEEPER &&
        !prev.allowedTabs.includes(tId) &&
        SENSITIVE_BOOKKEEPER_TABS.includes(tId)
      ) {
        const confirmed = window.confirm('記帳人員通常不開放營運總覽或報表中心。若開通，仍會隱藏股東個資與股東往來資料。確定要開通此功能嗎？');
        if (!confirmed) return prev;
      }
      const allowed = prev.allowedTabs.includes(tId)
        ? prev.allowedTabs.filter(id => id !== tId)
        : [...prev.allowedTabs, tId];
      return { ...prev, allowedTabs: allowed };
    });
  };

  const findDeletedShareholderByEmail = (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const now = new Date().toISOString();
    return getAuditArchive().find(item => (
      item.collection === 'shareholders' &&
      item.action === 'delete' &&
      (!item.purgeAfter || item.purgeAfter > now) &&
      String(item.before?.email || '').trim().toLowerCase() === normalizedEmail
    ));
  };

  const getNextShareholderId = (activeRows) => {
    const archivedIds = getAuditArchive()
      .filter(item => item.collection === 'shareholders' && item.before?.id)
      .map(item => item.before.id);
    const allIds = [...activeRows.map(item => item.id), ...archivedIds];
    const maxSeq = allIds.reduce((max, id) => {
      const seq = parseInt(String(id || '').replace('SH', ''), 10);
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
    return `SH${String(maxSeq + 1).padStart(3, '0')}`;
  };

  if (!canViewShareholders && activeSettingsTab === 'shareholder') {
    return (
      <div className="card">
        <div className="card-body">
          <div className="alert-box warning" style={{ margin: 0 }}>
            目前帳號沒有權限查看股東資料。
          </div>
        </div>
      </div>
    );
  }

  // Save changes
  const handleSave = async (e) => {
    e.preventDefault();
    let success = false;

    if (activeSettingsTab === 'shareholder') {
      const db = getShareholders();
      
      // Auto-extract last 4 digits of ID card as password
      let tempPassword = '1234';
      if (formData.idCard && formData.idCard.length >= 4) {
        tempPassword = formData.idCard.substring(formData.idCard.length - 4);
      }

      const finalEmail = String(formData.email || '').trim().toLowerCase();
      const typedPassword = String(formData.password || '').trim();
      const finalPassword = editingItem ? typedPassword : String(typedPassword || tempPassword).trim();
      const duplicateEmail = db.some(s => (
        s.id !== editingItem?.id &&
        String(s.email || '').trim().toLowerCase() === finalEmail
      ));

      if (duplicateEmail) {
        window.alert('這個 Email 已有其他帳號使用，請改用不同 Email。');
        return;
      }

      if (editingItem) {
        const idx = db.findIndex(s => s.id === editingItem.id);
        if (idx !== -1) {
          db[idx] = { 
            ...db[idx], 
            name: formData.name, 
            email: finalEmail, 
            idCard: formData.idCard,
            phone: formData.phone,
            role: formData.role,
            allowedCompanies: formData.allowedCompanies,
            allowedTabs: formData.allowedTabs,
            requiresPasswordChange: db[idx].requiresPasswordChange ?? true,
            disabled: db[idx].disabled ?? false,
            approvedDevices: db[idx].approvedDevices || [],
            pendingDevices: db[idx].pendingDevices || []
          };
          if (finalPassword) {
            db[idx].password = finalPassword;
            db[idx].requiresPasswordChange = true;
          }
          archiveChange({ collection: 'shareholders', recordId: editingItem.id, action: 'update', before: editingItem, after: db[idx], actor: '系統管理員', reason: '股東資料修改' });
          saveShareholders(db);
          success = true;
        }
      } else {
        const archivedMatch = findDeletedShareholderByEmail(finalEmail);
        if (archivedMatch?.before) {
          const choice = window.prompt(
            `這個 Email 曾經被刪除過。請輸入：\n\n復原：復原原帳號 ${archivedMatch.before.id}\n新建：建立新帳號\n取消：不處理`,
            '復原'
          );
          const rawChoice = String(choice || '').trim();
          const normalizedChoice = rawChoice.toUpperCase();
          if (!rawChoice || rawChoice === '取消' || normalizedChoice === 'CANCEL') return;
          if (rawChoice === '復原' || normalizedChoice === 'RESTORE') {
            if (db.some(item => item.id === archivedMatch.before.id)) {
              window.alert('無法復原，原帳號編號已被其他帳號使用，請改用建立新帳號。');
              return;
            }
            const restored = {
              ...archivedMatch.before,
              disabled: false,
              disabledAt: null,
              disabledReason: '',
              password: finalPassword || archivedMatch.before.password,
              role: formData.role || archivedMatch.before.role,
              allowedCompanies: formData.allowedCompanies.length ? formData.allowedCompanies : archivedMatch.before.allowedCompanies || [],
              allowedTabs: formData.allowedTabs.length ? formData.allowedTabs : archivedMatch.before.allowedTabs || [],
              requiresPasswordChange: true
            };
            db.push(restored);
            archiveChange({ collection: 'shareholders', recordId: restored.id, action: 'restore', before: archivedMatch.before, after: restored, actor: '系統管理員', reason: '同 Email 刪除帳號復原' });
            saveShareholders(db);
            success = true;
            setIsModalOpen(false);
            const cloudSaved = await onDataChange();
            if (cloudSaved === false) {
              showToast(getCloudSyncFailureMessage('帳號已復原，但雲端同步失敗'), 'error');
            } else {
              showToast('帳號已復原，雲端同步完成。', 'success');
            }
            return;
          }
          if (rawChoice !== '新建' && normalizedChoice !== 'NEW') {
            window.alert('請輸入「復原」、「新建」或「取消」。');
            return;
          }
        }

        const nextId = getNextShareholderId(db);
        db.push({ 
          id: nextId, 
          name: formData.name, 
          email: finalEmail, 
          idCard: formData.idCard,
          phone: formData.phone,
          password: finalPassword,
          role: formData.role,
          allowedCompanies: formData.allowedCompanies,
          allowedTabs: formData.allowedTabs,
          requiresPasswordChange: true,
          disabled: false,
          disabledAt: null,
          disabledReason: '',
          approvedDevices: [],
          pendingDevices: []
        });
        if (archivedMatch?.before) {
          archiveChange({ collection: 'shareholders', recordId: nextId, action: 'create_with_deleted_email', before: archivedMatch.before, after: db[db.length - 1], actor: '系統管理員', reason: '同 Email 刪除後建立新帳號' });
        }
        saveShareholders(db);
        success = true;
      }
    } else if (activeSettingsTab === 'bank') {
      const db = getBanks();
      const initBal = parseFloat(formData.initialBalance) || 0;
      if (editingItem) {
        const idx = db.findIndex(b => b.id === editingItem.id);
        if (idx !== -1) {
          db[idx] = { ...db[idx], companyId: formData.companyId, name: formData.bankName, accountNo: formData.accountNo, initialBalance: initBal };
          archiveChange({ collection: 'banks', recordId: editingItem.id, action: 'update', before: editingItem, after: db[idx], actor: '系統管理員', reason: '銀行帳戶修改' });
          saveBanks(db);
          success = true;
        }
      } else {
        const nextId = `BANK${String(db.length + 1).padStart(3, '0')}`;
        db.push({ id: nextId, companyId: formData.companyId, name: formData.bankName, accountNo: formData.accountNo, initialBalance: initBal });
        saveBanks(db);
        success = true;
      }
    } else if (activeSettingsTab === 'accounts') {
      const db = getChartOfAccounts();
      if (editingItem) {
        const idx = db.findIndex(a => a.code === editingItem.code);
        if (idx !== -1) {
          db[idx] = { ...db[idx], name: formData.accountName, type: formData.type, desc: formData.desc };
          archiveChange({ collection: 'chartOfAccounts', recordId: editingItem.code, action: 'update', before: editingItem, after: db[idx], actor: '系統管理員', reason: '會計科目修改' });
          saveChartOfAccounts(db);
          success = true;
        }
      } else {
        db.push({ code: formData.code, name: formData.accountName, type: formData.type, desc: formData.desc });
        saveChartOfAccounts(db);
        success = true;
      }
    } else if (activeSettingsTab === 'company') {
      const db = getCompanies();
      if (editingItem) {
        const idx = db.findIndex(c => c.id === editingItem.id);
        if (idx !== -1) {
          db[idx] = { ...db[idx], name: formData.compName, desc: formData.compDesc };
          archiveChange({ collection: 'companies', recordId: editingItem.id, action: 'update', before: editingItem, after: db[idx], actor: '系統管理員', reason: '公司資料修改' });
          saveCompanies(db);
          success = true;
        }
      } else {
        const nextId = `COMP${String(db.length + 1).padStart(3, '0')}`;
        db.push({ id: nextId, name: formData.compName, desc: formData.compDesc });
        saveCompanies(db);
        success = true;
      }
    }

    if (success) {
      setIsModalOpen(false);
      const cloudSaved = await onDataChange();
      if (cloudSaved === false) {
        showToast(getCloudSyncFailureMessage('資料已儲存在本機，但同步到雲端失敗'), 'error');
      } else {
        showToast('設定已儲存。', 'success');
      }
    }
  };

  const handleSecurityAction = async (action, userId, deviceId = null) => {
    let ok = false;
    if (action === 'disable') {
      const reason = window.prompt('請輸入停用原因') || '管理員停用';
      ok = setAccountDisabled(userId, true, reason);
    }
    if (action === 'enable') ok = setAccountDisabled(userId, false, '');
    if (action === 'approveDevice') ok = approveDevice(userId, deviceId);
    if (action === 'rejectDevice') ok = rejectDevice(userId, deviceId);
    if (action === 'revokeDevice') ok = revokeDevice(userId, deviceId);

    if (!ok) {
      showToast('操作失敗，請確認資料後再試。', 'error');
      return;
    }
    const cloudSaved = await onDataChange();
    showToast(
      cloudSaved === false ? getCloudSyncFailureMessage('安全設定已更新，但雲端同步失敗') : '安全設定已更新。',
      cloudSaved === false ? 'error' : 'success'
    );
  };

  // Delete Item
  const handleDelete = async (id) => {
    if (!window.confirm('確定要刪除這筆設定？刪除資料會保留一年後才清除。')) return;
    const reason = window.prompt('請輸入刪除原因，系統會保留一年稽核紀錄。');
    if (!reason) {
      window.alert('未輸入原因，刪除已取消。');
      return;
    }

    if (activeSettingsTab === 'shareholder') {
      const item = getShareholders().find(s => s.id === id);
      if (item) archiveDeletion({ collection: 'shareholders', record: item, actor: '系統管理員', reason });
      saveShareholders(getShareholders().filter(s => s.id !== id));
    } else if (activeSettingsTab === 'bank') {
      const item = getBanks().find(b => b.id === id);
      if (item) archiveDeletion({ collection: 'banks', record: item, actor: '系統管理員', reason });
      saveBanks(getBanks().filter(b => b.id !== id));
    } else if (activeSettingsTab === 'accounts') {
      const item = getChartOfAccounts().find(a => a.code === id);
      if (item) archiveDeletion({ collection: 'chartOfAccounts', record: item, actor: '系統管理員', reason });
      saveChartOfAccounts(getChartOfAccounts().filter(a => a.code !== id));
    } else if (activeSettingsTab === 'company') {
      const item = getCompanies().find(c => c.id === id);
      if (item) archiveDeletion({ collection: 'companies', record: item, actor: '系統管理員', reason });
      saveCompanies(getCompanies().filter(c => c.id !== id));
    }
    const cloudSaved = await onDataChange();
    showToast(
      cloudSaved === false ? getCloudSyncFailureMessage('資料已刪除並保留稽核紀錄，但雲端同步失敗') : '資料已刪除，稽核紀錄會保留一年。',
      cloudSaved === false ? 'error' : 'info'
    );
  };

  // Database resets/backups
  const handleResetDB = async () => {
    const confirmText = window.prompt('此動作會重置系統資料。若確定要繼續，請輸入 RESET。');
    if (confirmText !== 'RESET') {
      window.alert('重置已取消。');
      return;
    }
    const reason = window.prompt('請輸入重置原因') || '正式初始化';
    archiveResetSnapshot('系統管理員', reason);
    initializeDB(true);
    const cloudSaved = await onDataChange();
    showToast(
      cloudSaved === false ? getCloudSyncFailureMessage('資料已重置，但雲端同步失敗') : '資料已重置，重置前資料已保留一年。',
      cloudSaved === false ? 'error' : 'warning'
    );
  };

  const handleBackupExport = () => {
    const backupJson = exportBackup();
    const blob = new Blob([backupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BusinessPilot_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    showToast('備份檔已匯出。', 'success');
  };

  const handleBackupImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const res = importBackup(event.target.result);
      if (res.success) {
        onDataChange();
        showToast('備份資料已匯入。', 'success');
      } else {
        showToast(`匯入失敗：${res.error}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  async function refreshCloudBackups() {
    if (!isAdmin) return;
    const result = await listCloudBackups();
    if (!result.ok) {
      showToast(result.error || '讀取雲端備份失敗。', 'error');
      return;
    }
    setCloudBackups(result.backups || []);
  }

  const handleManualCloudBackup = async () => {
    setBackupBusy(true);
    const result = await createManualCloudBackup('manual_from_settings');
    setBackupBusy(false);
    if (!result.ok) {
      showToast(result.error || '建立雲端備份失敗。', 'error');
      return;
    }
    showToast('雲端備份已建立。', 'success');
    refreshCloudBackups();
  };

  const handleRestoreCloudBackup = async (backupId) => {
    const confirmed = window.prompt('還原會覆蓋目前資料。若確定要繼續，請輸入 RESTORE。');
    if (confirmed !== 'RESTORE') return;

    setBackupBusy(true);
    const result = await restoreCloudBackup(backupId);
    setBackupBusy(false);
    if (!result.ok) {
      showToast(result.error || '還原雲端備份失敗。', 'error');
      return;
    }
    showToast('雲端備份已還原，請重新整理確認資料。', 'success');
    await onDataChange();
    refreshCloudBackups();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 1. Horizontal Settings Tabs Bar (Above Content Card) */}
      {isAdmin && (
        <div className="horizontal-settings-tabs">
          <button className={`horizontal-settings-tab-btn ${activeSettingsTab === 'shareholder' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('shareholder')}>
            股東資料
          </button>
          <button className={`horizontal-settings-tab-btn ${activeSettingsTab === 'bank' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('bank')}>
            銀行帳戶
          </button>
          <button className={`horizontal-settings-tab-btn ${activeSettingsTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('accounts')}>
            會計科目
          </button>
          <button className={`horizontal-settings-tab-btn ${activeSettingsTab === 'company' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('company')}>
            公司設定
          </button>
          <button className={`horizontal-settings-tab-btn ${activeSettingsTab === 'backup' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('backup')}>
            備份與還原
          </button>
          <button className={`horizontal-settings-tab-btn ${activeSettingsTab === 'periodLocks' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('periodLocks')}>
            關帳管理
          </button>
          <button className={`horizontal-settings-tab-btn ${activeSettingsTab === 'budgets' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('budgets')}>
            預算與提醒
          </button>
          <button className={`horizontal-settings-tab-btn ${activeSettingsTab === 'goLive' ? 'active' : ''}`} onClick={() => setActiveSettingsTab('goLive')}>
            上線檢查
          </button>
        </div>
      )}

      {/* 2. Main content container */}
      <div style={{ width: '100%' }}>
        {activeSettingsTab !== 'backup' && activeSettingsTab !== 'security' && activeSettingsTab !== 'periodLocks' && activeSettingsTab !== 'budgets' && activeSettingsTab !== 'goLive' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                {activeSettingsTab === 'shareholder' && '股東資料管理'}
                {activeSettingsTab === 'bank' && '銀行帳戶管理'}
                {activeSettingsTab === 'accounts' && '會計科目管理'}
                {activeSettingsTab === 'company' && '公司資料管理'}
              </span>
              {canEditShareholders && (
                <button className="btn btn-primary btn-sm" onClick={handleOpenAdd}>
                  {activeSettingsTab === 'shareholder' ? '新增股東' : '新增設定'}
                </button>
              )}
            </div>
            
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    {activeSettingsTab === 'shareholder' && (
                      <tr>
                        <th>股東姓名</th>
                        <th>持股比例</th>
                        {canEditShareholders && <th>電子信箱</th>}
                        {canEditShareholders && <th>登入密碼</th>}
                        {canEditShareholders && <th>身分證字號</th>}
                        {canEditShareholders && <th>聯絡手機</th>}
                        {canEditShareholders && <th>權限角色</th>}
                        {!canEditShareholders && <th style={{ textAlign: 'right' }}>出資金額</th>}
                        {!canEditShareholders && <th style={{ textAlign: 'right' }}>可分配比例</th>}
                        {canEditShareholders && <th>可看公司</th>}
                        {canEditShareholders && <th>可用功能</th>}
                        {canEditShareholders && <th style={{ textAlign: 'right' }}>操作</th>}
                      </tr>
                    )}
                    {activeSettingsTab === 'bank' && (
                      <tr>
                        <th>銀行代號</th>
                        <th>公司 ID</th>
                        <th>銀行名稱</th>
                        <th>帳號</th>
                        <th style={{ textAlign: 'right' }}>期初餘額 (TWD)</th>
                        <th style={{ textAlign: 'right' }}>操作</th>
                      </tr>
                    )}
                    {activeSettingsTab === 'accounts' && (
                      <tr>
                        <th>科目代碼</th>
                        <th>科目名稱</th>
                        <th>類型</th>
                        <th>備註</th>
                        <th style={{ textAlign: 'right' }}>操作</th>
                      </tr>
                    )}
                    {activeSettingsTab === 'company' && (
                      <tr>
                        <th>公司 ID</th>
                        <th>公司名稱</th>
                        <th>備註</th>
                        <th style={{ textAlign: 'right' }}>操作</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {activeSettingsTab === 'shareholder' && shareholders.map((sh, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{sh.id}</td>
                        <td style={{ fontWeight: '700' }}>{sh.name}</td>
                        {canEditShareholders && <td style={{ fontFamily: 'var(--font-mono)' }}>{sh.email}</td>}
                        {canEditShareholders && <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '750', color: 'var(--accent-blue)' }}>****</td>}
                        {canEditShareholders && (
                          <td>
                            <span className={`badge ${sh.role === USER_ROLES.ADMIN ? 'approved' : sh.role === USER_ROLES.BOOKKEEPER ? 'pending' : sh.role === USER_ROLES.BUSINESS_REVIEWER ? 'approved' : 'draft'}`}>
                              {getRoleLabel(sh.role)}
                            </span>
                          </td>
                        )}
                        {canEditShareholders && <td style={{ fontFamily: 'var(--font-mono)' }}>{sh.idCard}</td>}
                        {canEditShareholders && <td style={{ fontFamily: 'var(--font-mono)' }}>{sh.phone}</td>}
                        {!canEditShareholders && (
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            ${(shareholderSummary[sh.id]?.activeCapital || 0).toLocaleString()}
                          </td>
                        )}
                        {!canEditShareholders && (
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {shareholderSummary[sh.id]?.ratio || 0}%
                          </td>
                        )}
                        {canEditShareholders && (
                          <td style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', fontWeight: '600' }}>
                            {(sh.allowedCompanies || []).join(', ')}
                          </td>
                        )}
                        {canEditShareholders && (
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {(sh.allowedTabs || []).map(t => {
                              if (t === 'dashboard') return '營運總覽';
                              if (t === 'reports') return '報表中心';
                              if (t === 'inputs') return '日常金流';
                              return t;
                            }).join(', ')}
                          </td>
                        )}
                        {canEditShareholders && (
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(sh)}>編輯</button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(sh.id)}>刪除</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}

                    {activeSettingsTab === 'bank' && banks.map((b, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{b.id}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{b.companyId}</td>
                        <td style={{ fontWeight: '700' }}>{b.name}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{b.accountNo}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${b.initialBalance.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(b)}>編輯</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(b.id)}>刪除</button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {activeSettingsTab === 'accounts' && accounts.map((a, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{a.code}</td>
                        <td style={{ fontWeight: '700' }}>{a.name}</td>
                        <td>
                          <span className={`badge ${a.type === 'revenue' ? 'approved' : a.type === 'cogs' ? 'pending' : 'void'}`}>
                            {a.type === 'revenue' ? '收入' : a.type === 'cogs' ? '銷貨成本' : '支出'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{a.desc}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(a)}>編輯</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.code)}>刪除</button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {activeSettingsTab === 'company' && companies.map((c, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{c.id}</td>
                        <td style={{ fontWeight: '700' }}>{c.name}</td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{c.desc}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(c)}>編輯</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.id)}>刪除</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSettingsTab === 'budgets' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">預算與提醒設定</span>
            </div>
            <div className="card-body">
              {/* Part A: System Config */}
              <h3 style={{ fontSize: '1.15rem', borderBottom: '2px solid rgba(5, 178, 165, 0.15)', paddingBottom: '8px', marginBottom: '16px', color: 'var(--accent-blue)' }}>
                支票到期提醒設定
              </h3>
              <div className="form-group" style={{ backgroundColor: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                  <input
                    type="checkbox"
                    checked={systemConfig.enableCheckMaturityAlert}
                    onChange={(e) => {
                      const newConfig = { ...systemConfig, enableCheckMaturityAlert: e.target.checked };
                      setSystemConfig(newConfig);
                      saveSystemConfig(newConfig);
                      showToast(e.target.checked ? '支票到期提醒已啟用。' : '支票到期提醒已停用。', 'info');
                      onDataChange();
                    }}
                  />
                  啟用支票到期提醒（營運總覽顯示近期到期支票）
                </label>
                <p style={{ margin: '8px 0 0 26px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  開啟後，系統會在營運總覽提醒 3 天內到期且尚未兌現的支票。
                </p>
              </div>

              {/* Part B: Budgets */}
              <h3 style={{ fontSize: '1.15rem', borderBottom: '2px solid rgba(5, 178, 165, 0.15)', paddingBottom: '8px', marginBottom: '16px', color: 'var(--accent-green)' }}>
                月度預算與費用控管
              </h3>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ minWidth: '180px', marginBottom: 0 }}>
                  <label className="form-label">選擇公司</label>
                  <select className="select-dropdown" style={{ width: '100%' }} value={budgetCompanyId} onChange={e => setBudgetCompanyId(e.target.value)}>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ minWidth: '120px', marginBottom: 0 }}>
                  <label className="form-label">年度</label>
                  <select className="select-dropdown" style={{ width: '100%' }} value={budgetYear} onChange={e => setBudgetYear(parseInt(e.target.value, 10))}>
                    <option value="2025">2025 年</option>
                    <option value="2026">2026 年</option>
                    <option value="2027">2027 年</option>
                  </select>
                </div>
                <div className="form-group" style={{ minWidth: '120px', marginBottom: 0 }}>
                  <label className="form-label">月份</label>
                  <select className="select-dropdown" style={{ width: '100%' }} value={budgetMonth} onChange={e => setBudgetMonth(e.target.value)}>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                      <option key={m} value={m}>{m} 月</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>科目代碼</th>
                      <th>會計科目名稱</th>
                      <th>科目類型</th>
                      <th style={{ width: '220px' }}>月度預算金額 (TWD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseAndCogsAccounts.map(acc => {
                      const budgetKey = `${budgetCompanyId}_${budgetYear}_${budgetMonth}_${acc.code}`;
                      const currentVal = budgetDrafts[budgetKey] ?? '';
                      return (
                        <tr key={acc.code}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{acc.code}</td>
                          <td style={{ fontWeight: '600' }}>{acc.name}</td>
                          <td>
                            <span className={`badge ${acc.type === 'cogs' ? 'danger' : 'warning'}`}>
                              {acc.type === 'cogs' ? '銷貨成本' : '營業費用'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>$</span>
                              <input
                                type="number"
                                placeholder="輸入金額"
                                className="form-control"
                                style={{ padding: '6px 10px', fontSize: '0.9rem', width: '100%' }}
                                value={currentVal}
                                onChange={(e) => handleBudgetDraftChange(acc.code, e.target.value)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleSaveBudgets}>
                  儲存預算設定
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSettingsTab === 'goLive' && (
          <GoLiveView
            companies={companies}
            onDataChange={onDataChange}
            showToast={showToast}
          />
        )}

        {activeSettingsTab === 'security' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">帳號安全管理</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {securityUsers.map(user => (
                <div key={user.id} className="security-user-panel">
                  <div className="security-user-head">
                    <div>
                      <div style={{ fontWeight: 800 }}>{user.name}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{user.email} / {getRoleLabel(user.role)}</div>
                    </div>
                    <div className="security-badges">
                      <span className={`badge ${user.requiresPasswordChange ? 'pending' : 'approved'}`}>{user.requiresPasswordChange ? '首次登入需改密碼' : '已設定密碼'}</span>
                      <span className={`badge ${user.disabled ? 'void' : 'approved'}`}>{user.disabled ? '已停用' : '可登入'}</span>
                    </div>
                  </div>

                  <div className="security-actions">
                    {user.disabled ? (
                      <button className="btn btn-primary btn-sm" onClick={() => handleSecurityAction('enable', user.id)}>啟用帳號</button>
                    ) : (
                      <button className="btn btn-danger btn-sm" onClick={() => handleSecurityAction('disable', user.id)}>停用帳號</button>
                    )}
                  </div>

                  <div className="security-device-grid">
                    <div>
                      <div className="security-section-title">待核准裝置</div>
                      {(user.pendingDevices || []).length === 0 ? (
                        <div className="security-empty">目前沒有待核准裝置</div>
                      ) : (
                        (user.pendingDevices || []).map(device => (
                          <div key={device.id} className="security-device-row">
                            <div>
                              <strong>{device.label || device.id}</strong>
                              <span>{device.requestedAt ? new Date(device.requestedAt).toLocaleString() : ''}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className="btn btn-primary btn-sm" onClick={() => handleSecurityAction('approveDevice', user.id, device.id)}>核准</button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleSecurityAction('rejectDevice', user.id, device.id)}>拒絕</button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div>
                      <div className="security-section-title">已核准裝置</div>
                      {(user.approvedDevices || []).length === 0 ? (
                        <div className="security-empty">尚未核准任何裝置</div>
                      ) : (
                        (user.approvedDevices || []).map(device => (
                          <div key={device.id} className="security-device-row">
                            <div>
                              <strong>{device.label || device.id}</strong>
                              <span>{device.approvedAt ? `核准：${new Date(device.approvedAt).toLocaleString()}` : ''}</span>
                            </div>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleSecurityAction('revokeDevice', user.id, device.id)}>撤銷</button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSettingsTab === 'periodLocks' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">關帳管理</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">公司</label>
                  <select
                    className="select-dropdown"
                    style={{ width: '100%' }}
                    value={periodLockForm.companyId || companies[0]?.id || ''}
                    onChange={e => setPeriodLockForm({ ...periodLockForm, companyId: e.target.value })}
                  >
                    {companies.map(company => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">月份</label>
                  <input
                    type="month"
                    className="form-control"
                    value={periodLockForm.yearMonth}
                    onChange={e => setPeriodLockForm({ ...periodLockForm, yearMonth: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">備註</label>
                <input
                  type="text"
                  className="form-control"
                  value={periodLockForm.remarks}
                  onChange={e => setPeriodLockForm({ ...periodLockForm, remarks: e.target.value })}
                  placeholder="例如：完成本月結帳檢查"
                />
              </div>

              <div className={`alert-box ${closeBlockers > 0 ? 'warning' : 'success'}`} style={{ margin: 0, alignItems: 'flex-start' }}>
                <div style={{ width: '100%' }}>
                  <strong>關帳前檢核：{closeBlockers > 0 ? '不可關帳' : '可關帳'}</strong>
                  <div className="summary-grid" style={{ marginTop: '12px' }}>
                    <div className="summary-card">
                      <div className="summary-label">查帳分數</div>
                      <div className="summary-value">{closeReadiness.score}</div>
                    </div>
                    <div className="summary-card">
                      <div className="summary-label">待審資料</div>
                      <div className={`summary-value ${closeReadiness.pendingRows?.length ? 'expense' : 'income'}`}>{closeReadiness.pendingRows?.length || 0}</div>
                    </div>
                    <div className="summary-card">
                      <div className="summary-label">傳票不平衡</div>
                      <div className={`summary-value ${closeReadiness.unbalancedEntries?.length ? 'expense' : 'income'}`}>{closeReadiness.unbalancedEntries?.length || 0}</div>
                    </div>
                    <div className="summary-card">
                      <div className="summary-label">缺憑證</div>
                      <div className={`summary-value ${closeReadiness.approvedWithoutAttachment?.length ? 'expense' : 'income'}`}>{closeReadiness.approvedWithoutAttachment?.length || 0}</div>
                    </div>
                    <div className="summary-card">
                      <div className="summary-label">應稅缺發票</div>
                      <div className={`summary-value ${closeReadiness.taxableWithoutInvoice?.length ? 'expense' : 'income'}`}>{closeReadiness.taxableWithoutInvoice?.length || 0}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-danger" onClick={() => handlePeriodLockToggle(true)}>鎖定月份</button>
                <button type="button" className="btn btn-secondary" onClick={() => handlePeriodLockToggle(false)}>解除鎖定</button>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>公司</th>
                      <th>年月</th>
                      <th>月份</th>
                      <th>檢核分數</th>
                      <th>關帳檢核</th>
                      <th>鎖定人 / 時間</th>
                      <th>解除人 / 時間</th>
                      <th>備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodLocks.length === 0 && (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px' }}>
                          目前沒有關帳紀錄
                        </td>
                      </tr>
                    )}
                    {periodLocks.map((lock, idx) => (
                      <tr key={`${lock.companyId}-${lock.yearMonth}-${idx}`}>
                        <td>{companies.find(company => company.id === lock.companyId)?.name || lock.companyId}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{lock.yearMonth}</td>
                        <td>
                          <span className={`badge ${lock.locked ? 'void' : 'approved'}`}>{lock.locked ? '已鎖定' : '開放中'}</span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{lock.closeScore || '-'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {lock.closeChecklist ? (
                            <>
                              待審 {lock.closeChecklist.pendingCount || 0}、
                              不平衡 {lock.closeChecklist.unbalancedCount || 0}、
                              缺憑證 {lock.closeChecklist.missingReceiptCount || 0}、
                              缺發票 {lock.closeChecklist.missingInvoiceCount || 0}
                            </>
                          ) : '-'}
                        </td>
                        <td>
                          <div>{lock.lockedBy || '-'}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{lock.lockedAt ? new Date(lock.lockedAt).toLocaleString() : '-'}</div>
                        </td>
                        <td>
                          <div>{lock.unlockedBy || '-'}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{lock.unlockedAt ? new Date(lock.unlockedAt).toLocaleString() : '-'}</div>
                        </td>
                        <td>{lock.remarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Database backup tab */}
        {activeSettingsTab === 'backup' && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">備份與還原設定</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ marginBottom: '4px' }}>雲端備份</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                      系統會保留最近的雲端備份紀錄，並在設定完成後同步到 Google Drive；還原前請先確認備份內容正確。
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={refreshCloudBackups} disabled={backupBusy}>
                      重新整理
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleManualCloudBackup} disabled={backupBusy}>
                      建立手動備份
                    </button>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>建立時間</th>
                        <th>原因</th>
                        <th>資料大小</th>
                        <th>Drive 檔案</th>
                        <th>保留期限</th>
                        <th style={{ textAlign: 'right' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cloudBackups.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '20px' }}>
                            目前沒有雲端備份紀錄
                          </td>
                        </tr>
                      )}
                      {cloudBackups.map(backup => (
                        <tr key={backup.id}>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{backup.created_at ? new Date(backup.created_at).toLocaleString() : '-'}</td>
                          <td>{backup.reason}</td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{Number(backup.state_bytes || 0).toLocaleString()} bytes</td>
                          <td>
                            <span className={`badge ${backup.drive_status === 'uploaded' ? 'approved' : backup.drive_status === 'failed' ? 'void' : 'draft'}`}>
                              {backup.drive_status === 'uploaded' ? '已上傳至 Drive' : backup.drive_status === 'failed' ? 'Drive 失敗' : '等待同步 Drive'}
                            </span>
                            {backup.drive_error && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--accent-red)', marginTop: '4px' }}>{backup.drive_error}</div>
                            )}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{backup.purge_after ? new Date(backup.purge_after).toLocaleDateString() : '-'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-danger btn-sm" onClick={() => handleRestoreCloudBackup(backup.id)} disabled={backupBusy}>
                              還原
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '2px solid var(--border-color)' }} />

              <div>
                <h4 style={{ marginBottom: '8px' }}>一次性完整資料匯出 (Export JSON)</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>
                  匯出目前系統資料成 JSON 備份檔，適合在大量調整資料前先留一份本機備份。
                </p>
                <button className="btn btn-primary" onClick={handleBackupExport}>
                  匯出系統備份檔
                </button>
              </div>

              <hr style={{ border: 'none', borderTop: '2px solid var(--border-color)' }} />

              <div>
                <h4 style={{ marginBottom: '8px' }}>從本機備份還原 (Import JSON)</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>
                  匯入 JSON 備份會覆蓋目前本機資料。請確認已先建立備份，並只匯入可信任的備份檔。
                </p>
                <input type="file" accept=".json" className="form-control" style={{ maxWidth: '300px', cursor: 'pointer' }} onChange={handleBackupImport} />
              </div>

              <hr style={{ border: 'none', borderTop: '2px solid var(--border-color)' }} />

              <div>
                <h4 style={{ marginBottom: '8px', color: 'var(--accent-red)' }}>重置系統資料 (Factory Reset)</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>
                  會先保存一份重置前快照，再把資料恢復成系統初始狀態。正式上線後請謹慎使用。
                </p>
                <button className="btn btn-danger" onClick={handleResetDB}>
                  重置系統資料
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Form Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">
                {activeSettingsTab === 'shareholder' ? (
                  editingItem ? '編輯股東' : '新增股東'
                ) : (
                  `${editingItem ? '編輯設定' : '新增設定'} - ${
                    activeSettingsTab === 'bank' ? '銀行帳戶' :
                    activeSettingsTab === 'accounts' ? '會計科目' : '公司資料'
                  }`
                )}
              </span>
              <button type="button" className="modal-close" onClick={() => setIsModalOpen(false)}>x</button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                {/* 1. Shareholder fields */}
                {activeSettingsTab === 'shareholder' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">股東姓名</label>
                      <input type="text" required placeholder="例如：王小明" className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">電子信箱（作為登入帳號）</label>
                      <input type="email" required placeholder="example@mail.com" className="form-control" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">登入密碼（留空則預設為身分證後 4 碼）</label>
                      <input type="text" placeholder="留空自動使用身分證後 4 碼" className="form-control" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                    </div>
                    {isAdmin && (
                      <div className="form-group">
                        <label className="form-label">權限角色</label>
                        <select required className="select-dropdown" style={{ width: '100%' }} value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                          <option value={USER_ROLES.ADMIN}>系統管理員</option>
                          <option value={USER_ROLES.BUSINESS_REVIEWER}>審核管理者/經營股東</option>
                          <option value={USER_ROLES.BOOKKEEPER}>記帳人員</option>
                          <option value={USER_ROLES.READONLY_SHAREHOLDER}>只讀股東</option>
                        </select>
                      </div>
                    )}
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">身分證字號（初始密碼為後 4 碼）</label>
                        <input 
                          type="text" 
                          required 
                          placeholder="例如：A123456789"
                          className="form-control" 
                          value={formData.idCard} 
                          onChange={e => setFormData({ ...formData, idCard: e.target.value.toUpperCase() })} 
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">聯絡手機</label>
                        <input type="text" placeholder="例如：0912-345678" className="form-control" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                      </div>
                    </div>

                    {/* Company authorization checks */}
                    <div className="form-group" style={{ marginTop: '8px' }}>
                      <label className="form-label">可使用公司</label>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        {companies.map(c => (
                          <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                            <input 
                              type="checkbox" 
                              checked={formData.allowedCompanies.includes(c.id)} 
                              onChange={() => handleCompanyToggle(c.id)} 
                            />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Tab authorization checks */}
                    <div className="form-group">
                      <label className="form-label">可使用功能</label>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '8px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                          <input 
                            type="checkbox" 
                            checked={formData.allowedTabs.includes('dashboard')} 
                            onChange={() => handleTabToggle('dashboard')} 
                          />
                          營運總覽
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                          <input 
                            type="checkbox" 
                            checked={formData.allowedTabs.includes('reports')} 
                            onChange={() => handleTabToggle('reports')} 
                          />
                          報表中心
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                          <input 
                            type="checkbox" 
                            checked={formData.allowedTabs.includes('inputs')} 
                            onChange={() => handleTabToggle('inputs')} 
                          />
                          日常金流記帳
                        </label>
                      </div>
                    </div>
                  </>
                )}

                {/* 2. Bank fields */}
                {activeSettingsTab === 'bank' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">所屬公司</label>
                      <select required className="select-dropdown" style={{ width: '100%' }} value={formData.companyId} onChange={e => setFormData({ ...formData, companyId: e.target.value })}>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">銀行名稱</label>
                      <input type="text" required placeholder="例如：第一銀行 - 活存" className="form-control" value={formData.bankName} onChange={e => setFormData({ ...formData, bankName: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">銀行帳號</label>
                      <input type="text" required placeholder="例如：123-45-67890-1" className="form-control" value={formData.accountNo} onChange={e => setFormData({ ...formData, accountNo: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">期初餘額 (TWD)</label>
                      <input type="number" required placeholder="請輸入金額" className="form-control" disabled={!!editingItem} value={formData.initialBalance} onChange={e => setFormData({ ...formData, initialBalance: e.target.value })} />
                    </div>
                  </>
                )}

                {/* 3. Account Chart fields */}
                {activeSettingsTab === 'accounts' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">科目代碼</label>
                      <input type="text" required placeholder="例如：6101" className="form-control" disabled={!!editingItem} value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">科目名稱</label>
                      <input type="text" required placeholder="例如：銷貨收入" className="form-control" value={formData.accountName} onChange={e => setFormData({ ...formData, accountName: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">科目類型</label>
                      <select required className="select-dropdown" style={{ width: '100%' }} value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                        <option value="revenue">收入 (Revenue)</option>
                        <option value="cogs">銷貨成本 (COGS)</option>
                        <option value="expense">支出 (Expense)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">科目備註</label>
                      <input type="text" placeholder="科目用途說明" className="form-control" value={formData.desc} onChange={e => setFormData({ ...formData, desc: e.target.value })} />
                    </div>
                  </>
                )}

                {/* 4. Company fields */}
                {activeSettingsTab === 'company' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">公司名稱</label>
                      <input type="text" required placeholder="例如：瓦斯行有限公司" className="form-control" value={formData.compName} onChange={e => setFormData({ ...formData, compName: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">公司備註</label>
                      <input type="text" placeholder="公司用途或說明" className="form-control" value={formData.compDesc} onChange={e => setFormData({ ...formData, compDesc: e.target.value })} />
                    </div>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  儲存設定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
