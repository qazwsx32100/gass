import React, { useMemo, useState } from 'react';
import {
  getCustomers,
  saveCustomers,
  getSuppliers,
  saveSuppliers,
  getGoLiveChecks,
  saveGoLiveChecks,
  getBackupRestoreDrills,
  saveBackupRestoreDrills,
  getProductionInitialization,
  saveProductionInitialization,
  getGasInventoryModulePlan
} from '../db/storage';
import { getCustomerReceivableSummary, getSupplierPayableSummary } from '../utils/financials';

const statusLabel = {
  pending: '待確認',
  passed: '已完成',
  blocked: '需處理',
  failed: '失敗'
};

const initLabels = {
  testDataCleared: '測試資料已清空',
  companyProfileReady: '公司基本資料已確認',
  chartOfAccountsReady: '會計科目已確認',
  shareholdersReady: '股東資料已確認',
  bankOpeningBalancesReady: '銀行與期初餘額已確認',
  customersReady: '客戶與應收流程已確認',
  suppliersReady: '供應商與應付流程已確認',
  openingInventoryReserved: '瓦斯完整庫存模組已預留'
};

export default function GoLiveView({ companies, onDataChange, showToast }) {
  const [refresh, setRefresh] = useState(0);
  const [companyId, setCompanyId] = useState(companies[0]?.id || 'COMP001');
  const [customerDraft, setCustomerDraft] = useState({
    name: '',
    taxId: '',
    contactPerson: '',
    phone: '',
    email: '',
    paymentTermsDays: 30,
    creditLimit: 0,
    remarks: ''
  });
  const [drillDraft, setDrillDraft] = useState({
    drillDate: new Date().toISOString().split('T')[0],
    backupSource: 'manual_backup',
    restoredTo: 'test_environment',
    result: 'passed',
    operator: '',
    remarks: ''
  });
  const [supplierDraft, setSupplierDraft] = useState({
    name: '',
    taxId: '',
    contactPerson: '',
    phone: '',
    email: '',
    paymentTermsDays: 30,
    remarks: ''
  });

  const customers = useMemo(() => getCustomers().filter(item => item.companyId === companyId), [companyId, refresh]);
  const suppliers = useMemo(() => getSuppliers().filter(item => item.companyId === companyId), [companyId, refresh]);
  const receivableSummary = useMemo(() => getCustomerReceivableSummary(companyId), [companyId, refresh]);
  const payableSummary = useMemo(() => getSupplierPayableSummary(companyId), [companyId, refresh]);
  const checks = useMemo(() => getGoLiveChecks(), [refresh]);
  const drills = useMemo(() => getBackupRestoreDrills(), [refresh]);
  const initialization = useMemo(() => getProductionInitialization(), [refresh]);
  const gasPlan = useMemo(() => getGasInventoryModulePlan(), [refresh]);
  const doneCount = checks.filter(item => item.status === 'passed').length;

  const saveAndRefresh = async (message) => {
    setRefresh(v => v + 1);
    showToast?.(message, 'success');
    await onDataChange?.();
  };

  const handleAddCustomer = async (event) => {
    event.preventDefault();
    if (!customerDraft.name.trim()) {
      showToast?.('請輸入客戶名稱', 'error');
      return;
    }
    const now = new Date().toISOString();
    saveCustomers([
      ...getCustomers(),
      {
        ...customerDraft,
        companyId,
        id: `CUS${now.replace(/[-:.TZ]/g, '')}`,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }
    ]);
    setCustomerDraft({
      name: '',
      taxId: '',
      contactPerson: '',
      phone: '',
      email: '',
      paymentTermsDays: 30,
      creditLimit: 0,
      remarks: ''
    });
    await saveAndRefresh('客戶資料已新增');
  };

  const handleDisableCustomer = async (customerId) => {
    const list = getCustomers().map(item => item.id === customerId
      ? { ...item, status: 'inactive', updatedAt: new Date().toISOString() }
      : item
    );
    saveCustomers(list);
    await saveAndRefresh('客戶已停用，資料仍保留');
  };

  const handleAddSupplier = async (event) => {
    event.preventDefault();
    if (!supplierDraft.name.trim()) {
      showToast?.('請輸入供應商名稱', 'error');
      return;
    }
    const now = new Date().toISOString();
    saveSuppliers([
      ...getSuppliers(),
      {
        ...supplierDraft,
        companyId,
        id: `SUP${now.replace(/[-:.TZ]/g, '')}`,
        status: 'active',
        createdAt: now,
        updatedAt: now
      }
    ]);
    setSupplierDraft({
      name: '',
      taxId: '',
      contactPerson: '',
      phone: '',
      email: '',
      paymentTermsDays: 30,
      remarks: ''
    });
    await saveAndRefresh('供應商資料已新增');
  };

  const handleDisableSupplier = async (supplierId) => {
    const list = getSuppliers().map(item => item.id === supplierId
      ? { ...item, status: 'inactive', updatedAt: new Date().toISOString() }
      : item
    );
    saveSuppliers(list);
    await saveAndRefresh('供應商已停用，資料仍保留');
  };

  const handleCheckChange = async (id, patch) => {
    const actor = '系統管理員';
    const next = checks.map(item => item.id === id
      ? {
          ...item,
          ...patch,
          checkedAt: patch.status ? new Date().toISOString() : item.checkedAt,
          checkedBy: patch.status ? actor : item.checkedBy
        }
      : item
    );
    saveGoLiveChecks(next);
    await saveAndRefresh('上線檢查已更新');
  };

  const handleInitializationToggle = async (key) => {
    const next = {
      ...initialization,
      [key]: !initialization[key],
      lastInitializedAt: new Date().toISOString(),
      initializedBy: '系統管理員'
    };
    saveProductionInitialization(next);
    await saveAndRefresh('初始化狀態已更新');
  };

  const handleInitializationNotes = async (value) => {
    saveProductionInitialization({ ...initialization, notes: value });
    await saveAndRefresh('初始化備註已更新');
  };

  const handleAddDrill = async (event) => {
    event.preventDefault();
    const now = new Date().toISOString();
    saveBackupRestoreDrills([
      {
        ...drillDraft,
        id: `DRL${now.replace(/[-:.TZ]/g, '')}`,
        createdAt: now
      },
      ...getBackupRestoreDrills()
    ]);
    setDrillDraft({
      drillDate: new Date().toISOString().split('T')[0],
      backupSource: 'manual_backup',
      restoredTo: 'test_environment',
      result: 'passed',
      operator: '',
      remarks: ''
    });
    await saveAndRefresh('備份還原演練紀錄已新增');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">上線檢查與營運補強</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div className="summary-card">
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>上線檢查完成度</div>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>{doneCount}/{checks.length}</div>
            </div>
            <div className="summary-card">
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>客戶主檔</div>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>{customers.filter(c => c.status !== 'inactive').length}</div>
            </div>
            <div className="summary-card">
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>還原演練紀錄</div>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>{drills.length}</div>
            </div>
          </div>

          <div className="form-group" style={{ maxWidth: '320px' }}>
            <label>公司</label>
            <select className="form-control" value={companyId} onChange={e => setCompanyId(e.target.value)}>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name || company.id}</option>
              ))}
            </select>
          </div>

          <section>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>正式上線檢查</h3>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>項目</th>
                    <th>狀態</th>
                    <th>備註</th>
                    <th>最後確認</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map(item => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>
                        <select className="form-control" value={item.status} onChange={e => handleCheckChange(item.id, { status: e.target.value })}>
                          <option value="pending">待確認</option>
                          <option value="passed">已完成</option>
                          <option value="blocked">需處理</option>
                        </select>
                      </td>
                      <td>
                        <input className="form-control" defaultValue={item.notes} onBlur={e => handleCheckChange(item.id, { notes: e.target.value })} placeholder="補充說明" />
                      </td>
                      <td>{item.checkedAt ? new Date(item.checkedAt).toLocaleString('zh-TW') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>正式資料初始化</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              {Object.entries(initLabels).map(([key, label]) => (
                <label key={key} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <input type="checkbox" checked={Boolean(initialization[key])} onChange={() => handleInitializationToggle(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <textarea
              className="form-control"
              defaultValue={initialization.notes}
              onBlur={e => handleInitializationNotes(e.target.value)}
              placeholder="初始化備註，例如：保留哪些正式科目、股東、銀行帳戶"
              rows={3}
              style={{ marginTop: '12px' }}
            />
          </section>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">客戶資料與應收基礎</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <form onSubmit={handleAddCustomer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>客戶名稱</label>
              <input className="form-control" value={customerDraft.name} onChange={e => setCustomerDraft({ ...customerDraft, name: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>統編</label>
              <input className="form-control" value={customerDraft.taxId} onChange={e => setCustomerDraft({ ...customerDraft, taxId: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>聯絡人</label>
              <input className="form-control" value={customerDraft.contactPerson} onChange={e => setCustomerDraft({ ...customerDraft, contactPerson: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>電話</label>
              <input className="form-control" value={customerDraft.phone} onChange={e => setCustomerDraft({ ...customerDraft, phone: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>收款天數</label>
              <input type="number" className="form-control" value={customerDraft.paymentTermsDays} onChange={e => setCustomerDraft({ ...customerDraft, paymentTermsDays: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">新增客戶</button>
          </form>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>客戶</th>
                  <th>統編</th>
                  <th>電話</th>
                  <th style={{ textAlign: 'right' }}>未收款</th>
                  <th>帳齡</th>
                  <th>狀態</th>
                  <th style={{ textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>尚未建立客戶資料</td></tr>
                )}
                {customers.map(customer => {
                  const summary = receivableSummary.find(item => item.id === customer.id) || {};
                  return (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.taxId || '-'}</td>
                      <td>{customer.phone || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{Number(summary.receivableTotal || 0).toLocaleString()}</td>
                      <td>{summary.unpaidCount ? `${summary.agingBucket} 天` : '-'}</td>
                      <td>{customer.status === 'inactive' ? '已停用' : '啟用'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {customer.status !== 'inactive' && (
                          <button className="btn btn-secondary btn-sm" onClick={() => handleDisableCustomer(customer.id)}>停用</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>



      <div className="card">
        <div className="card-header">
          <span className="card-title">供應商資料與應付基礎</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <form onSubmit={handleAddSupplier} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label>供應商名稱</label><input className="form-control" value={supplierDraft.name} onChange={e => setSupplierDraft({ ...supplierDraft, name: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>統編</label><input className="form-control" value={supplierDraft.taxId} onChange={e => setSupplierDraft({ ...supplierDraft, taxId: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>聯絡人</label><input className="form-control" value={supplierDraft.contactPerson} onChange={e => setSupplierDraft({ ...supplierDraft, contactPerson: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>電話</label><input className="form-control" value={supplierDraft.phone} onChange={e => setSupplierDraft({ ...supplierDraft, phone: e.target.value })} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label>付款天數</label><input type="number" className="form-control" value={supplierDraft.paymentTermsDays} onChange={e => setSupplierDraft({ ...supplierDraft, paymentTermsDays: e.target.value })} /></div>
            <button className="btn btn-primary" type="submit">新增供應商</button>
          </form>
          <div className="table-responsive">
            <table className="data-table">
              <thead><tr><th>供應商</th><th>統編</th><th>電話</th><th style={{ textAlign: 'right' }}>未付款</th><th>帳齡</th><th>狀態</th><th style={{ textAlign: 'right' }}>操作</th></tr></thead>
              <tbody>
                {suppliers.length === 0 && (<tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>尚未建立供應商資料</td></tr>)}
                {suppliers.map(supplier => {
                  const summary = payableSummary.find(item => item.id === supplier.id) || {};
                  return (
                    <tr key={supplier.id}>
                      <td>{supplier.name}</td><td>{supplier.taxId || '-'}</td><td>{supplier.phone || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{Number(summary.payableTotal || 0).toLocaleString()}</td>
                      <td>{summary.unpaidCount ? String(summary.agingBucket || '') + ' 天' : '-'}</td>
                      <td>{supplier.status === 'inactive' ? '已停用' : '啟用'}</td>
                      <td style={{ textAlign: 'right' }}>{supplier.status !== 'inactive' && (<button className="btn btn-secondary btn-sm" onClick={() => handleDisableSupplier(supplier.id)}>停用</button>)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">備份還原演練</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <form onSubmit={handleAddDrill} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>演練日期</label>
              <input type="date" className="form-control" value={drillDraft.drillDate} onChange={e => setDrillDraft({ ...drillDraft, drillDate: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>結果</label>
              <select className="form-control" value={drillDraft.result} onChange={e => setDrillDraft({ ...drillDraft, result: e.target.value })}>
                <option value="passed">成功</option>
                <option value="failed">失敗</option>
                <option value="pending">待補測</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>執行人</label>
              <input className="form-control" value={drillDraft.operator} onChange={e => setDrillDraft({ ...drillDraft, operator: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>備註</label>
              <input className="form-control" value={drillDraft.remarks} onChange={e => setDrillDraft({ ...drillDraft, remarks: e.target.value })} />
            </div>
            <button className="btn btn-primary" type="submit">新增演練</button>
          </form>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>來源</th>
                  <th>還原環境</th>
                  <th>結果</th>
                  <th>執行人</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {drills.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>尚未建立還原演練紀錄</td></tr>
                )}
                {drills.map(item => (
                  <tr key={item.id}>
                    <td>{item.drillDate}</td>
                    <td>{item.backupSource}</td>
                    <td>{item.restoredTo}</td>
                    <td>{statusLabel[item.result] || item.result}</td>
                    <td>{item.operator || '-'}</td>
                    <td>{item.remarks || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">瓦斯完整庫存模組預留</span>
        </div>
        <div className="card-body">
          <div style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>
            {gasPlan.notes}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            {gasPlan.plannedFields.map(field => (
              <div key={field} style={{ padding: '10px 12px', border: '1px dashed var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                {field}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
